import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { commentQueue } from '../lib/queue.js';

// Request validation schema
const submitJobSchema = z.object({
    video_url: z.string().url().refine(
        (url) => url.includes('tiktok.com') || url.includes('instagram.com'),
        { message: 'Must be a valid TikTok or Instagram URL' }
    ),
    comments: z.array(z.object({
        id: z.string(),
        text: z.string().min(1).max(500),
        replyToUsername: z.string().optional(), // Changed to camelCase
        delay_seconds: z.number().int().min(0).default(0),
    })).min(1).max(50),
    config: z.object({
        delay_between_comments: z.object({
            min: z.number().int().min(0).default(30),
            max: z.number().int().min(0).default(120),
        }).optional(),
        retry_on_fail: z.boolean().default(true),
        max_retries: z.number().int().min(0).max(5).default(2),
    }).optional(),
    callback_url: z.string().url().optional(),
});

export async function commentsRoutes(fastify: FastifyInstance) {
    // POST /api/v1/comments - Submit comment job
    fastify.post('/comments', async (request, reply) => {
        console.log('📥 Incoming Payload:', JSON.stringify(request.body, null, 2)); // DEBUG LOG
        // Validate request body
        const validation = submitJobSchema.safeParse(request.body);

        if (!validation.success) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request body',
                    details: validation.error.format(),
                },
            });
        }

        const { video_url, comments, config, callback_url } = validation.data;
        const jobId = `job_${nanoid(12)}`;

        // Check if we have available accounts
        const availableAccounts = await prisma.account.count({
            where: { status: 'available' },
        });

        if (availableAccounts === 0) {
            return reply.status(503).send({
                success: false,
                error: {
                    code: 'NO_ACCOUNTS_AVAILABLE',
                    message: 'No buzzer accounts are currently available',
                    details: {},
                },
            });
        }

        // Create job in database
        const job = await prisma.job.create({
            data: {
                id: jobId,
                videoUrl: video_url,
                totalComments: comments.length,
                config: config || {},
                callbackUrl: callback_url,
                comments: {
                    create: comments.map((c) => ({
                        id: `comment_${nanoid(12)}`,
                        externalId: c.id,
                        text: c.text,
                        replyToUsername: c.replyToUsername, // Changed mapping
                        delaySeconds: c.delay_seconds,
                    })),
                },
            },
            include: {
                comments: true,
            },
        });

        // Add job to queue
        await commentQueue.add('process-job', {
            jobId: job.id,
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
        });

        // Calculate estimated completion
        const avgDelayPerComment = 60; // seconds
        const totalDelay = comments.reduce((sum, c) => sum + c.delay_seconds, 0);
        const estimatedSeconds = (comments.length * avgDelayPerComment) + totalDelay;
        const estimatedCompletion = new Date(Date.now() + estimatedSeconds * 1000);

        return {
            success: true,
            data: {
                job_id: job.id,
                status: job.status,
                total_comments: job.totalComments,
                estimated_completion: estimatedCompletion.toISOString(),
                created_at: job.createdAt.toISOString(),
            },
        };
    });

    // GET /api/v1/comments/:job_id - Get job status
    fastify.get('/comments/:job_id', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };

        const job = await prisma.job.findUnique({
            where: { id: job_id },
            include: {
                comments: {
                    include: {
                        account: true,
                    },
                },
            },
        });

        if (!job) {
            return reply.status(404).send({
                success: false,
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: `Job with ID ${job_id} not found`,
                    details: {},
                },
            });
        }

        const progress = {
            total: job.totalComments,
            completed: job.completedComments,
            failed: job.failedComments,
            pending: job.totalComments - job.completedComments - job.failedComments,
        };

        return {
            success: true,
            data: {
                job_id: job.id,
                status: job.status,
                video_url: job.videoUrl,
                progress,
                comments: job.comments.map((c) => ({
                    id: c.externalId,
                    status: c.status,
                    account_used: c.account?.tiktokUsername || null,
                    executed_at: c.executedAt?.toISOString() || null,
                    error: c.errorMessage,
                    text: c.text,
                })),
                created_at: job.createdAt.toISOString(),
                updated_at: job.updatedAt.toISOString(),
            },
        };
    });
}
