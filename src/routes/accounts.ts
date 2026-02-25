import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export async function accountsRoutes(fastify: FastifyInstance) {
    // GET /api/v1/accounts - Get available accounts
    fastify.get('/accounts', async (request, reply) => {
        const accounts = await prisma.account.findMany({
            orderBy: { lastUsedAt: 'desc' },
        });

        const summary = {
            total: accounts.length,
            available: accounts.filter((a) => a.status === 'available').length,
            in_use: accounts.filter((a) => a.status === 'in_use').length,
            cooldown: accounts.filter((a) => a.status === 'cooldown').length,
            by_provider: {
                gologin: accounts.filter((a) => a.browserProvider === 'gologin').length,
                multilogin: accounts.filter((a) => a.browserProvider === 'multilogin').length,
            },
        };

        return {
            success: true,
            data: {
                ...summary,
                accounts: accounts.map((a) => ({
                    id: a.id,
                    username: a.tiktokUsername,
                    browser_provider: a.browserProvider,
                    status: a.status,
                    last_used: a.lastUsedAt,
                    cooldown_until: a.cooldownUntil,
                })),
            },
        };
    });

    // POST /api/v1/accounts - Add new account (admin)
    // Supports both GoLogin and Multilogin
    fastify.post('/accounts', async (request, reply) => {
        const body = request.body as {
            id: string;
            tiktok_username: string;
            browser_provider?: 'gologin' | 'multilogin';  // default: gologin
            gologin_profile_id?: string;
            multilogin_profile_id?: string;
            proxy_config?: object;
        };

        // Validate: need at least one profile ID
        const provider = body.browser_provider || 'gologin';

        if (provider === 'gologin' && !body.gologin_profile_id) {
            return reply.status(400).send({
                success: false,
                error: 'gologin_profile_id is required when browser_provider is gologin',
            });
        }

        if (provider === 'multilogin' && !body.multilogin_profile_id) {
            return reply.status(400).send({
                success: false,
                error: 'multilogin_profile_id is required when browser_provider is multilogin',
            });
        }

        const account = await prisma.account.create({
            data: {
                id: body.id,
                tiktokUsername: body.tiktok_username,
                browserProvider: provider,
                gologinProfileId: body.gologin_profile_id || null,
                multiloginProfileId: body.multilogin_profile_id || null,
                proxyConfig: body.proxy_config ? (body.proxy_config as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
        });

        return {
            success: true,
            data: {
                id: account.id,
                username: account.tiktokUsername,
                browser_provider: account.browserProvider,
                status: account.status,
            },
        };
    });


    // DELETE /api/v1/accounts/:id - Delete single account
    fastify.delete('/accounts/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            await prisma.account.delete({ where: { id } });
            return { success: true, message: `Account ${id} deleted` };
        } catch {
            return reply.status(404).send({ success: false, error: 'Account not found' });
        }
    });

    // DELETE /api/v1/accounts - Delete ALL accounts (Dev utility)
    fastify.delete('/accounts', async (request, reply) => {
        // Clean up references first to avoid Foreign Key errors
        await prisma.executionLog.deleteMany({}); // Warning: Deletes logs
        await prisma.comment.updateMany({
            where: { accountId: { not: null } },
            data: { accountId: null }
        });

        const { count } = await prisma.account.deleteMany({});
        return { success: true, message: `All accounts deleted (${count}). Related logs cleared.` };
    });
}
