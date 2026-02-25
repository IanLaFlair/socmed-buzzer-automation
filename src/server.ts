import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { authMiddleware } from './middleware/auth.js';
import { commentsRoutes } from './routes/comments.js';
import { accountsRoutes } from './routes/accounts.js';
import { healthRoutes } from './routes/health.js';

export async function buildServer() {
    const fastify = Fastify({
        logger: {
            level: 'info',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                },
            },
        },
    });

    // Register plugins
    await fastify.register(cors, { origin: true });

    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });

    // Auth middleware for /api routes
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.url.startsWith('/api/v1') && !request.url.includes('/health')) {
            await authMiddleware(request, reply);
        }
    });

    // Register routes
    await fastify.register(healthRoutes, { prefix: '/api/v1' });
    await fastify.register(commentsRoutes, { prefix: '/api/v1' });
    await fastify.register(accountsRoutes, { prefix: '/api/v1' });

    return fastify;
}
