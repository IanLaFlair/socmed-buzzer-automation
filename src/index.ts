import 'dotenv/config';
import { buildServer } from './server.js';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { startWorker } from './workers/comment.worker.js';

async function main() {
    const server = await buildServer();

    // Test database connection
    try {
        await prisma.$connect();
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }

    // Start the worker
    startWorker();
    console.log('✅ Comment worker started');

    // Start the server
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        console.log(`🚀 Server running on http://localhost:${config.PORT}`);
    } catch (error) {
        server.log.error(error);
        process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\\n🛑 Shutting down...');
        await server.close();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();
