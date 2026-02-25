/**
 * Unified Browser Provider
 * Abstracts GoLogin and Multilogin behind a common interface
 */

import { startGoLoginProfile, stopGoLoginProfile, GoLoginSession } from './gologin.js';
import { startMultiloginProfile, stopMultiloginProfile, MultiloginSession } from './multilogin.js';

export type BrowserProvider = 'gologin' | 'multilogin';

export interface BrowserProfile {
    id: string;
    provider: BrowserProvider;
    profileId: string; // The actual profile ID for the provider
}

export interface BrowserSession {
    wsUrl: string;
    provider: BrowserProvider;
    profileId: string;
    _gologinSession?: GoLoginSession;
    _multiloginSession?: MultiloginSession;
}

/**
 * Start a browser profile using the appropriate provider
 */
export async function startBrowserProfile(profile: BrowserProfile): Promise<BrowserSession> {
    console.log(`🌐 Starting ${profile.provider} profile: ${profile.profileId}`);

    if (profile.provider === 'gologin') {
        const session = await startGoLoginProfile({
            id: profile.id,
            gologinProfileId: profile.profileId,
        });

        return {
            wsUrl: session.wsUrl,
            provider: 'gologin',
            profileId: profile.profileId,
            _gologinSession: session,
        };
    }

    if (profile.provider === 'multilogin') {
        const session = await startMultiloginProfile({
            id: profile.id,
            multiloginProfileId: profile.profileId,
        });

        return {
            wsUrl: session.wsUrl,
            provider: 'multilogin',
            profileId: profile.profileId,
            _multiloginSession: session,
        };
    }

    throw new Error(`Unknown browser provider: ${profile.provider}`);
}

/**
 * Stop a browser session
 */
export async function stopBrowserSession(session: BrowserSession): Promise<void> {
    console.log(`🛑 Stopping ${session.provider} profile: ${session.profileId}`);

    if (session.provider === 'gologin' && session._gologinSession) {
        await stopGoLoginProfile(session._gologinSession);
    } else if (session.provider === 'multilogin' && session._multiloginSession) {
        await stopMultiloginProfile(session._multiloginSession);
    }
}

/**
 * Get profile info from account data
 */
export function getProfileFromAccount(account: {
    id: string;
    browserProvider: string;
    gologinProfileId: string | null;
    multiloginProfileId: string | null;
}): BrowserProfile {
    const provider = account.browserProvider as BrowserProvider;

    let profileId: string;

    if (provider === 'multilogin') {
        if (!account.multiloginProfileId) {
            throw new Error(`Account ${account.id} has provider=multilogin but no multiloginProfileId`);
        }
        profileId = account.multiloginProfileId;
    } else {
        // Default to gologin
        if (!account.gologinProfileId) {
            throw new Error(`Account ${account.id} has provider=gologin but no gologinProfileId`);
        }
        profileId = account.gologinProfileId;
    }

    return {
        id: account.id,
        provider,
        profileId,
    };
}
