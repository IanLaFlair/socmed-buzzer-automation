import puppeteer, { Page, Browser, ElementHandle } from 'puppeteer-core';
import { BrowserProfile, BrowserSession, startBrowserProfile, stopBrowserSession } from './browser-provider.js';

interface ExecuteCommentParams {
    videoUrl: string; // Used as Post URL
    commentText: string;
    account: BrowserProfile;
    replyToUsername?: string;
}

export async function executeInstagramComment(params: ExecuteCommentParams): Promise<void> {
    const { videoUrl, commentText, account, replyToUsername } = params;

    console.log('📸 IG Bot Trace:', JSON.stringify({ videoUrl, commentText, replyToUsername }, null, 2));

    let browser: Browser | null = null;
    let session: BrowserSession | null = null;

    try {
        session = await startBrowserProfile(account);

        console.log(`🔗 Connecting Puppeteer...`);
        browser = await puppeteer.connect({
            browserWSEndpoint: session.wsUrl,
            defaultViewport: null,
        });

        // Cleanup: Open new page FIRST, then close others (to avoid 0 tabs crash)
        const page = await browser.newPage();

        const openPages = await browser.pages();
        for (const p of openPages) {
            if ((p.target() as any)._targetId !== (page.target() as any)._targetId) {
                await p.close().catch(() => { });
            }
        }

        page.setDefaultTimeout(60000);

        // Navigate
        console.log(`📍 Navigating to: ${videoUrl}`);
        await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await randomDelay(2000, 4000);
        await takeScreenshot(page, '1-ig-loaded');

        // Check Login
        const isLoginWall = await page.evaluate(() => {
            const bodyText = document.body.innerText || '';
            const title = document.title;
            return (bodyText.includes('Log In') && bodyText.includes('Sign Up')) ||
                title.includes('Login') ||
                document.querySelector('input[name="username"]');
        });

        if (isLoginWall) {
            console.log(`⚠️ Detected Login Wall!`);
            await takeScreenshot(page, 'login-wall-detected');
        }

        try {
            await page.waitForSelector('article', { timeout: 15000 });
            console.log(`✅ Post article loaded`);
        } catch {
            console.log(`⚠️ Article selector not found.`);
            await takeScreenshot(page, 'no-article');
        }

        await randomDelay(1000, 2000);

        // REELS / REPLY LOGIC
        if (replyToUsername) {
            console.log(`🔍 REPLY MODE: Targeting user "${replyToUsername}"`);
            await findInstagramReplyButton(page, replyToUsername);
            await randomDelay(1000, 2000);
        } else {
            // STANDARD: Ensure drawer is open
            const commentIcon = await page.$('svg[aria-label="Comment"], svg[aria-label="Komentar"]');
            if (videoUrl.includes('/reel') && commentIcon) {
                console.log('🎥 Reels detected, ensuring comment drawer is open...');
                const inputVisible = await page.$('textarea, form textarea');
                if (!inputVisible) {
                    await commentIcon.evaluate(e => (e.closest('button') as HTMLElement)?.click() || (e.closest('div[role="button"]') as HTMLElement)?.click());
                    await randomDelay(2000, 3000);
                }
            }
        }

        // FIND INPUT & TYPE COMMENT
        console.log(`💬 Finding comment input...`);
        let inputFound = false;
        const selectors = [
            'textarea[aria-label="Add a comment…"]',
            'textarea[placeholder="Add a comment…"]',
            'form textarea',
            '[contenteditable="true"]',
            'form'
        ];

        for (const sel of selectors) {
            const el = await page.$(sel);
            if (el) {
                console.log(`   Found via selector: ${sel}`);
                await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
                await randomDelay(500, 1000);
                await el.click();

                // STRICT VERIFICATION & CURSOR FLUSH
                if (replyToUsername) {
                    await randomDelay(1000, 2000);
                    const val = await el.evaluate((e: any) => e.value || e.innerText || '');
                    if (!val.includes('@')) {
                        console.log('⛔ FAILURE: Input does not contain @mention. Reply click verification failed.');
                        throw new Error('Reply mode verification failed. The comment would not be nested.');
                    } else {
                        console.log('✅ Reply verification passed. Flushing cursor to End...');
                        // Press END to ensure we don't type in middle of username
                        await page.keyboard.press('End');
                        await randomDelay(200, 500);
                    }
                }

                if (sel === 'form') {
                    const nestedInput = await el.$('textarea') || await el.$('[contenteditable="true"]');
                    if (nestedInput) {
                        await nestedInput.click();
                        if (replyToUsername) await page.keyboard.press('End');

                        await randomDelay(500, 1000);
                        await page.keyboard.type(commentText, { delay: 100 });
                        inputFound = true;
                        break;
                    }
                } else {
                    await randomDelay(500, 1000);
                    await page.keyboard.type(commentText, { delay: 100 });
                    inputFound = true;
                    break;
                }
            }
        }

        if (!inputFound) {
            console.log(`   Trying deep text search...`);
            const fallback = await page.evaluateHandle(() => {
                const all = document.querySelectorAll('textarea, div[role="textbox"]');
                for (const el of Array.from(all)) {
                    const attr = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
                    if (attr.includes('comment') || attr.includes('komentar')) return el;
                }
                return null;
            });
            if (fallback.asElement()) {
                await (fallback.asElement() as ElementHandle<Element>).click();
                if (replyToUsername) await page.keyboard.press('End');

                await randomDelay(500, 1000);
                if (replyToUsername) {
                    const val = await page.evaluate(() => document.activeElement?.textContent || (document.activeElement as any)?.value || '');
                    if (!val.includes('@')) throw new Error('Reply mode verification failed (Fallback method).');
                }
                await page.keyboard.type(commentText, { delay: 100 });
                inputFound = true;
            }
        }

        if (!inputFound) throw new Error('Input not found');

        await randomDelay(2000, 3000);

        // POST
        console.log(`📤 Finding Post button...`);
        const postBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            const textMatch = buttons.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return t === 'post' || t === 'kirim';
            });
            if (textMatch) return textMatch;
            return document.querySelector('form button[type="submit"]');
        });

        if (postBtn.asElement()) {
            await (postBtn.asElement() as ElementHandle<Element>).click();
            console.log(`✅ Clicked Post`);
        } else {
            console.log(`⚠️ Post button not found, trying Enter...`);
            await page.keyboard.press('Enter');
        }

        await randomDelay(5000, 7000);
        await takeScreenshot(page, 'posted');
        console.log(`🎉 Process finished`);

    } catch (error) {
        console.error(`❌ IG Error:`, error);
        if (browser && session) {
            const pages = await browser.pages();
            if (pages.length > 0) await takeScreenshot(pages[0], 'error-snapshot');
        }
        throw error;
    } finally {
        if (browser) try { await browser.close(); } catch { }
        if (session) try { await stopBrowserSession(session); } catch { }
    }
}

// === HELPERS ===

async function findInstagramReplyButton(page: Page, targetUsername: string) {
    if (page.url().includes('/reel')) {
        const commentIcon = await page.$('svg[aria-label="Comment"], svg[aria-label="Komentar"]');
        if (commentIcon) {
            const inputVisible = await page.$('textarea, form textarea');
            if (!inputVisible) {
                await commentIcon.evaluate(e => (e.closest('button') as HTMLElement)?.click() || (e.closest('div[role="button"]') as HTMLElement)?.click());
                await randomDelay(2000, 3000);
            }
        }
    }

    console.log(`🔎 Searching for @${targetUsername}...`);

    let found = false;
    let attempts = 0;
    while (!found && attempts < 15) {
        // STEP 1: SCROLL (Browser Side)
        const scrolled = await page.evaluate((username) => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const matches = allElements.filter(el => {
                const text = el.innerText || '';
                return text.length < 100 && text.toLowerCase().includes(username.toLowerCase());
            });

            for (const match of matches) {
                if (match instanceof HTMLElement) {
                    match.scrollIntoView({ block: 'center', behavior: 'instant' });
                    return true;
                }
            }
            return false;
        }, targetUsername);

        if (scrolled) {
            // STABILITY DELAY FOR REFLOW
            await randomDelay(1000, 1500);

            // STEP 2: GET COORDS (Now that layout is stable)
            const coords = await page.evaluate((username) => {
                const allElements = Array.from(document.querySelectorAll('*'));
                const matches = allElements.filter(el => {
                    const text = el.innerText || '';
                    return text.length < 100 && text.toLowerCase().includes(username.toLowerCase());
                });

                for (const match of matches) {
                    let container = match.parentElement as HTMLElement | null;
                    let depth = 0;
                    while (container && depth < 8) {
                        const candidates = Array.from(container.querySelectorAll('*'));
                        const replyBtnText = candidates.find(b => {
                            const t = b.textContent?.trim().toLowerCase();
                            return t === 'reply' || t === 'balas' || t === 'jawab' || t === 'membalas';
                        });

                        if (replyBtnText && replyBtnText instanceof HTMLElement) {
                            const rect = replyBtnText.getBoundingClientRect();
                            // CHECK VISIBILITY
                            if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                                return {
                                    found: true,
                                    x: rect.left + rect.width / 2,
                                    y: rect.top + rect.height / 2
                                };
                            }
                        }
                        container = container.parentElement;
                        depth++;
                    }
                }
                return { found: false, x: 0, y: 0 };
            }, targetUsername);

            // STEP 3: TRUSTED CLICK
            if (coords.found) {
                console.log(`   Found at (${coords.x}, ${coords.y}). Moving mouse...`);

                await page.mouse.move(coords.x, coords.y);
                await randomDelay(200, 500);
                await page.mouse.click(coords.x, coords.y);
                await randomDelay(2500, 3500);

                // STEP 4: VERIFY
                const isReplyMode = await page.evaluate(() => {
                    const input = document.querySelector('textarea, div[role="textbox"], [contenteditable="true"]');
                    const val = (input as any)?.value || input?.textContent || '';
                    return val.includes('@');
                });

                if (isReplyMode) {
                    console.log(`✅ Found @${targetUsername} and Verified Reply Mode (Trusted Click).`);
                    return;
                } else {
                    console.log(`⚠️ Trusted Click at (${coords.x}, ${coords.y}) failed? Input NOT updated.`);
                }
            } else {
                console.log(`   Target found but OFF-SCREEN (coords invalid). Continuing scroll...`);
            }
        } else {
            console.log(`   Ref (target user) Not found visible???, COMPUTED SCROLL... (${attempts + 1}/15)`);
            // ... Computed Scroll Logic
            await page.evaluate(() => {
                const dialog = document.querySelector('div[role="dialog"]');
                let startNode = dialog || document.body;
                const descendants = Array.from(startNode.querySelectorAll('div, ul'));
                const scrollableEl = descendants.find(el => {
                    const style = window.getComputedStyle(el);
                    const isOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll';
                    const canScroll = el.scrollHeight > el.clientHeight;
                    return isOverflow && canScroll;
                });

                if (scrollableEl) {
                    scrollableEl.scrollTop += 600;
                } else {
                    window.scrollBy(0, 600);
                }
            });
        }

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const viewMore = buttons.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return t?.includes('view more') || t?.includes('lihat komentar') ||
                    (b.querySelector('svg[aria-label="Plus"]') !== null);
            });
            if (viewMore) (viewMore as HTMLElement).click();
        });

        await randomDelay(2000, 4000);
        attempts++;
    }

    throw new Error(`Could not find comment by @${targetUsername}`);
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
    try {
        const path = `/tmp/ig-${name}-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: false });
        console.log(`📸 ${path}`);
    } catch { }
}

function randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
}
