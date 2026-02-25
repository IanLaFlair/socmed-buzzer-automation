import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';

export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || apiKey !== config.API_KEY) {
        return reply.status(401).send({
            success: false,
            error: {
                code: 'INVALID_API_KEY',
                message: 'Invalid or missing API key',
                details: {},
            },
        });
    }
}
