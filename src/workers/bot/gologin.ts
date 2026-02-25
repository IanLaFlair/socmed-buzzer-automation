import GoLogin from 'gologin';
import { config } from '../../config/index.js';

export interface GoLoginProfile {
    id: string;
    gologinProfileId: string;
}

export interface GoLoginSession {
    wsUrl: string;
    gologin: unknown;
}

export async function startGoLoginProfile(profile: GoLoginProfile): Promise<GoLoginSession> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gologin = new (GoLogin as any)({
        token: config.GOLOGIN_API_TOKEN,
        profile_id: profile.gologinProfileId,
    });

    console.log(`🌐 Starting GoLogin profile: ${profile.gologinProfileId}`);

    const { wsUrl } = await gologin.start();

    console.log(`✅ GoLogin profile started, WebSocket URL: ${wsUrl}`);

    return { wsUrl, gologin };
}

export async function stopGoLoginProfile(session: GoLoginSession): Promise<void> {
    console.log(`🛑 Stopping GoLogin profile`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session.gologin as any).stop();
}
