import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { executeComment } from './bot/tiktok.js';
import { executeInstagramComment } from './bot/instagram.js';
import { getProfileFromAccount } from './bot/browser-provider.js';
import { sendWebhook } from '../services/webhook.service.js';
import { config } from '../config/index.js';

interface JobData {
    jobId: string;
}

async function processCommentJob(job: Job<JobData>) {
    const { jobId } = job.data;

    console.log(`📝 Processing job: ${jobId}`);

    // Get job with comments
    const dbJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
            comments: {
                where: { status: 'pending' },
                orderBy: { delaySeconds: 'asc' },
            },
        },
    });

    if (!dbJob) {
        throw new Error(`Job ${jobId} not found`);
    }

    // Update job status to in_progress
    await prisma.job.update({
        where: { id: jobId },
        data: { status: 'in_progress' },
    });

    // Send webhook: job started
    if (dbJob.callbackUrl) {
        await sendWebhook(dbJob.callbackUrl, {
            event: 'job.started',
            job_id: jobId,
        });
    }

    // --- PARALLEL EXECUTION LOGIC ---
    // Process threads in batches (Concurrency = MAX_CONCURRENT_JOBS for this worker)
    const concurrency = config.MAX_CONCURRENT_JOBS || 5;
    console.log(`🚀 Starting parallel processing with concurrency: ${concurrency}`);

    const pendingComments = dbJob.comments;

    // Split into chunks or use a pool
    const results = await processInBatch(pendingComments, concurrency, async (comment) => {
        try {
            // Initial Delay (if specified per comment)
            if (comment.delaySeconds > 0) {
                await sleep(comment.delaySeconds * 1000);
            }

            // ATOMIC ACQUIRE ACCOUNT
            // We loop until we get an account or timeout
            let account = null;
            let attempts = 0;
            while (!account && attempts < 10) {
                account = await getAndLockAccount();
                if (!account) {
                    await sleep(2000); // Wait for an account to free up
                    attempts++;
                }
            }

            if (!account) {
                throw new Error('No available accounts after waiting');
            }

            // Mark Account In Use
            // (Done inside getAndLockAccount preferably, but we do it here if using simple find)
            // Note: getAndLockAccount handles the 'in_use' update to be safe.

            // Update comment status
            await prisma.comment.update({
                where: { id: comment.id },
                data: {
                    status: 'in_progress',
                    accountId: account.id,
                },
            });

            // Execute
            const replyTo = (comment as any).replyToUsername;
            console.log(`👷 Worker executing comment ${comment.id} via ${account.tiktokUsername}`);

            const startTime = Date.now();
            const profile = getProfileFromAccount(account);

            if (dbJob.videoUrl.includes('instagram.com')) {
                await executeInstagramComment({
                    videoUrl: dbJob.videoUrl,
                    commentText: comment.text,
                    account: profile,
                    replyToUsername: replyTo || undefined
                });
            } else {
                await executeComment({
                    videoUrl: dbJob.videoUrl,
                    commentText: comment.text,
                    replyToUsername: replyTo || undefined,
                    account: profile,
                });
            }

            const duration = Date.now() - startTime;

            // Mark Success
            await prisma.comment.update({
                where: { id: comment.id },
                data: { status: 'success', executedAt: new Date() }
            });

            // Log
            await prisma.executionLog.create({
                data: {
                    commentId: comment.id,
                    accountId: account.id,
                    action: 'post_comment',
                    status: 'success',
                    durationMs: duration,
                },
            });

            // Stats Update
            await prisma.job.update({
                where: { id: jobId },
                data: { completedComments: { increment: 1 } }
            });

            // Release Account
            await prisma.account.update({
                where: { id: account.id },
                data: {
                    status: 'available',
                    lastUsedAt: new Date(),
                    totalComments: { increment: 1 },
                },
            });

            // Webhook
            if (dbJob.callbackUrl) {
                sendWebhook(dbJob.callbackUrl, { // Fire and forget (awaiting might slow down batch)
                    event: 'comment.completed',
                    job_id: jobId,
                    comment_id: comment.externalId,
                    status: 'success',
                    account_used: account.tiktokUsername
                }).catch(console.error);
            }

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Comment ${comment.id} failed: ${msg}`);

            await prisma.comment.update({
                where: { id: comment.id },
                data: { status: 'failed', errorMessage: msg, retryCount: { increment: 1 } }
            });

            await prisma.job.update({ where: { id: jobId }, data: { failedComments: { increment: 1 } } });

            // Release Account if it was assigned
            const accountId = (await prisma.comment.findUnique({ where: { id: comment.id } }))?.accountId;
            if (accountId) {
                const cooldown = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes cooldown
                await prisma.account.update({
                    where: { id: accountId },
                    data: {
                        status: 'available',
                        lastUsedAt: new Date(),
                        cooldownUntil: cooldown,
                    }
                }).catch(() => { });
            }
        }
    });

    // Final Job Status
    // (Existing logic...)
    const updatedJob = await prisma.job.findUnique({ where: { id: jobId } });
    let finalStatus = 'completed';
    if (updatedJob!.failedComments === updatedJob!.totalComments) finalStatus = 'failed';
    else if (updatedJob!.failedComments > 0) finalStatus = 'partial_success';

    await prisma.job.update({ where: { id: jobId }, data: { status: finalStatus } });
    console.log(`🏁 Job ${jobId} finished with status: ${finalStatus}`);
}

// Helper: Process items with concurrency limit
async function processInBatch<T>(items: T[], limit: number, iterator: (item: T) => Promise<void>) {
    const executing: Promise<void>[] = [];
    for (const item of items) {
        const p = iterator(item).then(() => {
            executing.splice(executing.indexOf(p), 1);
        });
        executing.push(p);
        if (executing.length >= limit) {
            await Promise.race(executing);
        }
    }
    return Promise.all(executing);
}

// Atomic Account Getter with Optimistic Locking
async function getAndLockAccount() {
    const limit = config.COMMENTS_PER_ACCOUNT_PER_DAY || 10;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        attempts++;

        // 1. Find Candidate (Read-only, no lock)
        // Try NEVER USED first
        let account = await prisma.account.findFirst({
            where: {
                status: 'available',
                lastUsedAt: null,
                OR: [
                    { cooldownUntil: null },
                    { cooldownUntil: { lt: new Date() } },
                ],
            },
        });

        // Fallback: Least Recently Used with Soft Cooldown
        if (!account) {
            const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
            account = await prisma.account.findFirst({
                where: {
                    status: 'available',
                    lastUsedAt: { lt: twoMinsAgo },
                    totalComments: { lt: limit },
                    OR: [
                        { cooldownUntil: null },
                        { cooldownUntil: { lt: new Date() } },
                    ],
                },
                orderBy: { lastUsedAt: 'asc' },
            });
        }

        if (!account) {
            // No available accounts at all
            return null;
        }

        // 2. ATOMIC ACQUIRE (Optimistic Lock)
        // Only update IF status is still 'available'
        const result = await prisma.account.updateMany({
            where: {
                id: account.id,
                status: 'available' // Critical check
            },
            data: {
                status: 'in_use'
            }
        });

        if (result.count > 0) {
            // Success! We updated exactly 1 row.
            return account;
        }

        // If count == 0, retry after delay
        await sleep(randomBetween(100, 500));
    }

    return null;
}


function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function startWorker() {
    const worker = new Worker('comment-jobs', processCommentJob, {
        connection: {
            host: new URL(config.REDIS_URL).hostname || 'localhost',
            port: parseInt(new URL(config.REDIS_URL).port || '6379'),
        },
        concurrency: 1, // BullMQ concurrency per worker (Top Level Jobs). We handle sub-concurrency inside.
    });

    worker.on('completed', (job) => { console.log(`✅ Job ${job.id} completed`); });
    worker.on('failed', (job, err) => { console.error(`❌ Job ${job?.id} failed:`, err.message); });

    return worker;
}
