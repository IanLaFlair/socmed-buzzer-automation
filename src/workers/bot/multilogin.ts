/**
 * Multilogin X API Integration
 * Docs: https://documenter.getpostman.com/view/28533318/2s946h9Cv9
 */

import { config } from '../../config/index.js';

// Multilogin X Launcher API (local agent)
const MULTILOGIN_LAUNCHER_BASE = 'https://launcher.mlx.yt:45001/api/v1';

export interface MultiloginProfile {
    id: string;
    multiloginProfileId: string;
}

export interface MultiloginSession {
    wsUrl: string;
    profileId: string;
}

interface TokenResponse {
    data: {
        token: string;
    };
}

interface StartProfileResponse {
    status: {
        error_code: string;
        http_code: number;
        message: string; // The port is here! e.g. "50253"
    };
    data?: {
        port: number;
    };
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get or refresh the Bearer token using automation token from env
 */
async function getToken(): Promise<string> {
    // Use automation token directly if available
    if (config.MULTILOGIN_AUTOMATION_TOKEN) {
        console.log(`🔐 Using Multilogin automation token from env`);
        return config.MULTILOGIN_AUTOMATION_TOKEN;
    }

    // Otherwise, get token via signin
    if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
        return cachedToken;
    }

    console.log(`🔐 Getting Multilogin token via signin...`);

    const response = await fetch(`https://api.multilogin.com/user/signin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: config.MULTILOGIN_EMAIL,
            password: config.MULTILOGIN_PASSWORD,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Multilogin auth failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as TokenResponse;
    cachedToken = data.data.token;
    tokenExpiry = Date.now() + 25 * 60 * 1000;

    console.log(`✅ Multilogin token obtained`);
    return cachedToken;
}

/**
 * Start a Multilogin browser profile using the launcher API
 */
export async function startMultiloginProfile(profile: MultiloginProfile): Promise<MultiloginSession> {
    const token = await getToken();
    const profileId = profile.multiloginProfileId;

    console.log(`🌐 Starting Multilogin profile: ${profileId}`);

    // Get folder ID from config
    const folderId = config.MULTILOGIN_FOLDER_ID;
    if (!folderId) {
        throw new Error('MULTILOGIN_FOLDER_ID is required in .env for Multilogin integration');
    }

    // Use the launcher API to start profile
    // Format: GET /api/v1/profile/f/{folderId}/p/{profileId}/start?automation_type=puppeteer
    const startUrl = `${MULTILOGIN_LAUNCHER_BASE}/profile/f/${folderId}/p/${profileId}/start?automation_type=puppeteer&headless_mode=false`;

    console.log(`📡 Calling: ${startUrl}`);

    const response = await fetch(startUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
        },
    });

    const responseText = await response.text();
    console.log(`📥 Response (${response.status}): ${responseText}`);

    if (!response.ok) {
        throw new Error(`Failed to start Multilogin profile: ${response.status} - ${responseText}`);
    }

    let data: StartProfileResponse;
    try {
        data = JSON.parse(responseText);
    } catch {
        throw new Error(`Failed to parse Multilogin response: ${responseText}`);
    }

    // Port is in status.message according to user screenshot
    const portStr = data.status?.message;
    const port = portStr ? parseInt(portStr, 10) : undefined;

    if (!port || isNaN(port)) {
        throw new Error(`Multilogin response missing port (status.message: ${portStr}): ${responseText}`);
    }

    console.log(`✅ Multilogin profile started on port: ${port}. Fetching WebSocket URL...`);

    // Fetch the correct WebSocket URL from the browser instance
    // We need to wait a bit for the browser to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        const versionResponse = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (!versionResponse.ok) {
            throw new Error(`Failed to fetch browser version info: ${versionResponse.status}`);
        }

        const versionData = await versionResponse.json() as { webSocketDebuggerUrl: string };
        const wsUrl = versionData.webSocketDebuggerUrl;

        if (!wsUrl) {
            throw new Error(`Browser version info missing webSocketDebuggerUrl`);
        }

        console.log(`🔗 WebSocket URL found: ${wsUrl}`);
        return { wsUrl, profileId };

    } catch (error) {
        // Fallback to manual construction if fetching fails, though unlikely to work if we got here
        console.warn(`⚠️ Failed to fetch WebSocket URL automatically, falling back to default:`, error);
        const wsUrl = `ws://127.0.0.1:${port}/devtools/browser`;
        return { wsUrl, profileId };
    }
}

/**
 * Stop a Multilogin browser profile
 */
export async function stopMultiloginProfile(session: MultiloginSession): Promise<void> {
    console.log(`🛑 Stopping Multilogin profile: ${session.profileId}`);

    const token = await getToken();

    try {
        const folderId = config.MULTILOGIN_FOLDER_ID;
        const stopUrl = folderId
            ? `${MULTILOGIN_LAUNCHER_BASE}/profile/f/${folderId}/p/${session.profileId}/stop`
            : `${MULTILOGIN_LAUNCHER_BASE}/profile/stop/p/${session.profileId}`;

        console.log(`📡 Stopping via: ${stopUrl}`);

        const response = await fetch(stopUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        console.log(`📥 Stop response: ${response.status}`);
    } catch (e) {
        console.log(`⚠️ Failed to stop Multilogin profile:`, e);
    }

    console.log(`✅ Multilogin profile stopped`);
}

