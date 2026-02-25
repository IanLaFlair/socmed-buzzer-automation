import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export async function healthRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async (request, reply) => {
        const health = {
            status: 'healthy',
            version: '1.0.0',
            uptime: process.uptime(),
            components: {
                api: 'ok',
                database: 'ok',
                queue: 'ok',
                workers: {
                    total: 1,
                    active: 1,
                    idle: 0,
                },
            },
        };

        // Check database
        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch {
            health.components.database = 'error';
            health.status = 'degraded';
        }

        // Check Redis
        try {
            await redis.ping();
        } catch {
            health.components.queue = 'error';
            health.status = 'degraded';
        }

        return {
            success: true,
            data: health,
        };
    });
}
