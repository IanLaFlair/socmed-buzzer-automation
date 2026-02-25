import { z } from 'zod';

const envSchema = z.object({
    // GoLogin
    GOLOGIN_API_TOKEN: z.string().optional(),

    // Multilogin
    MULTILOGIN_EMAIL: z.string().optional(),
    MULTILOGIN_PASSWORD: z.string().optional(),
    MULTILOGIN_AUTOMATION_TOKEN: z.string().optional(),
    MULTILOGIN_FOLDER_ID: z.string().optional(),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // API
    API_KEY: z.string().min(1),
    PORT: z.coerce.number().default(3000),

    // Execution Config
    MAX_CONCURRENT_JOBS: z.coerce.number().default(10),
    COMMENTS_PER_ACCOUNT_PER_DAY: z.coerce.number().default(10),
    COOLDOWN_HOURS: z.coerce.number().default(24),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const config = loadConfig();
