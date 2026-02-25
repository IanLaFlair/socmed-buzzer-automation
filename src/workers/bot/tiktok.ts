import puppeteer, { Page, Browser, ElementHandle } from 'puppeteer-core';
import { BrowserProfile, BrowserSession, startBrowserProfile, stopBrowserSession } from './browser-provider.js';

interface ExecuteCommentParams {
  videoUrl: string;
  commentText: string;
  account: BrowserProfile;
  replyToUsername?: string;
}

export async function executeComment(params: ExecuteCommentParams): Promise<void> {
  const { videoUrl, commentText, account, replyToUsername } = params;

  console.log('🤖 Bot Trace:', JSON.stringify({ videoUrl, commentText, replyToUsername }, null, 2)); // DEBUG LOG

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

    page.setDefaultTimeout(120000);
    page.setDefaultTimeout(120000);

    const videoIdMatch = videoUrl.match(/video\/(\d+)/);
    const expectedVideoId = videoIdMatch ? videoIdMatch[1] : null;

    // Navigate to TikTok video
    console.log(`📍 Navigating to: ${videoUrl}`);
    await page.goto(videoUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    // Wait for video element
    await page.waitForSelector('video', { timeout: 30000 }).catch(() => { });

    // Wait for the action bar
    console.log(`⏳ Waiting for action bar...`);
    try {
      await page.waitForSelector('[data-e2e="like-icon"], [data-e2e="comment-icon"]', {
        timeout: 30000,
        visible: true
      });
      console.log(`✅ Action bar found`);
    } catch {
      console.log(`⚠️ Action bar not found via waitForSelector, waiting more...`);
      await randomDelay(10000, 15000);
    }

    // Additional wait
    await randomDelay(5000, 8000);

    // Verify URL
    const currentUrl = page.url();
    if (expectedVideoId && !currentUrl.includes(expectedVideoId)) {
      throw new Error(`Wrong video! Expected ${expectedVideoId}`);
    }

    await takeScreenshot(page, '1-loaded');

    // === BRANCHING LOGIC ===
    if (replyToUsername) {
      console.log(`🔍 REPLY MODE: Targeting user "${replyToUsername}"`);
      await findAndClickReply(page, replyToUsername);
    } else {
      console.log(`💬 STANDARD MODE: Posting top-level comment`);
      await clickTopLevelCommentIcon(page);
    }
    // =======================

    await randomDelay(3000, 5000);

    // Wait for and find editor
    console.log(`🔍 Waiting for editor...`);
    await page.waitForSelector('.public-DraftEditor-content, [contenteditable="true"]', {
      timeout: 15000,
      visible: true
    });

    // Focus Editor
    const editor = await page.$('.public-DraftEditor-content') || await page.$('[contenteditable="true"]');
    if (editor) {
      await page.evaluate((el) => { (el as HTMLElement).focus(); }, editor);
    }

    await randomDelay(500, 1000);

    // STRATEGY: Global Propagation Stopper (The "Silencer")
    console.log(`⌨️ Typing with Silencer: "${commentText}"`);

    await page.evaluate(() => {
      (window as any).__silencer = (e: KeyboardEvent) => {
        if (e.isTrusted) e.stopImmediatePropagation();
      };
      window.addEventListener('keydown', (window as any).__silencer, { capture: true });
      window.addEventListener('keypress', (window as any).__silencer, { capture: true });
      window.addEventListener('keyup', (window as any).__silencer, { capture: true });
    });

    if (editor) await editor.click();
    await randomDelay(200, 500);

    // Type normally
    await page.keyboard.type(commentText, { delay: 60 });

    // Remove Silencer
    await page.evaluate(() => {
      if ((window as any).__silencer) {
        window.removeEventListener('keydown', (window as any).__silencer, { capture: true });
        window.removeEventListener('keypress', (window as any).__silencer, { capture: true });
        window.removeEventListener('keyup', (window as any).__silencer, { capture: true });
      }
    });

    // Verification & Posting
    await new Promise(r => setTimeout(r, 1000));

    // Check Text
    const currentText = await page.evaluate(() => {
      const el = document.querySelector('.public-DraftEditor-content, [contenteditable="true"]');
      return el?.textContent?.trim() || '';
    });

    if ((!currentText || currentText.trim().length === 0) && commentText.length > 0) {
      throw new Error('Failed to inject text into editor');
    }

    // Click Post
    console.log(`📤 Posting...`);
    await randomDelay(1000, 2000);
    const postBtn = await page.$('[data-e2e="comment-post"]');

    if (postBtn) {
      // Disabled Check
      const isDisabled = await page.evaluate((btn) => (btn as HTMLButtonElement).disabled, postBtn);
      if (isDisabled) {
        console.log(`⚠️ Post button disabled! Trying aggressive activation...`);
        await page.click('.public-DraftEditor-content');
        await page.keyboard.press('Backspace');
        await randomDelay(500, 1000);
      }

      console.log(`🖱️ JS Click Post...`);
      await page.evaluate((btn) => { (btn as HTMLElement).click(); }, postBtn);
      console.log(`✅ Clicked`);
    } else {
      throw new Error('Post button not found');
    }

    await randomDelay(5000, 7000);
    await takeScreenshot(page, '4-posted');

    // Final Success Check
    const afterText = await page.evaluate(() => {
      const el = document.querySelector('.public-DraftEditor-content, [contenteditable="true"]');
      return el?.textContent?.trim() || '';
    });

    if (afterText.length < (commentText.length / 2)) {
      console.log(`🎉 Comment posted!`);
    } else {
      console.log(`⚠️ Editor still has text - comment may not have posted`);
    }

  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  } finally {
    if (browser) try { await browser.close(); } catch { }
    if (session) try { await stopBrowserSession(session); } catch { }
  }
}

// === HELPER FUNCTIONS ===

async function clickTopLevelCommentIcon(page: Page) {
  console.log(`💬 Finding top-level comment icon...`);
  await page.waitForSelector('[data-e2e="comment-icon"]', { timeout: 20000, visible: true }).catch(() => { });

  const commentIcon = await page.$('[data-e2e="comment-icon"]');
  if (commentIcon) {
    const box = await commentIcon.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    // Alternative selectors if main one fails
    const altSelectors = ['[data-e2e="browse-comment-icon"]', 'button[aria-label*="comment" i]'];
    for (const sel of altSelectors) {
      const el = await page.$(sel);
      if (el) {
        const box = await el.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          return;
        }
      }
    }
    throw new Error('Comment icon not found');
  }
}

async function findAndClickReply(page: Page, targetUsername: string) {
  console.log(`🔎 Searching for comment by @${targetUsername}... (Text-Based Strategy)`);

  // First, ensure comment drawer is open
  await clickTopLevelCommentIcon(page);
  await randomDelay(2000, 4000);

  let found = false;
  let attempts = 0;
  const maxAttempts = 20;

  while (!found && attempts < maxAttempts) {

    // 1. Find elements containing the username using XPath
    // We look for any text node containing the username
    const xpath = `//*[contains(text(), "${targetUsername}")]`;
    const candidates = await page.$$(`xpath/${xpath}`);

    console.log(`🔎 Scan #${attempts + 1}: Found ${candidates.length} matches for text "${targetUsername}"`);

    for (const candidate of candidates) {
      // Helper to find Reply button in ancestors
      const handle = await page.evaluateHandle(async (el) => {
        let current: Element | null = el as Element;
        let depth = 0;
        const maxDepth = 8; // Traverse up 8 levels

        while (current && depth < maxDepth) {
          // Check if this container has a Reply button
          const replyBtn = current.querySelector('[data-e2e="comment-reply"]');
          if (replyBtn) return replyBtn;

          // Check text "Reply" or "Balas"
          // Strategy: ALL child elements, check text
          // Note: querying all descendants can be expensive, but we do it on a small component
          const all = current.querySelectorAll('*');
          for (const child of Array.from(all)) {
            const t = child.textContent?.trim().toLowerCase();
            if (t === 'reply' || t === 'balas' || t === 'membalas') {
              return child;
            }
          }

          // Move up
          current = current.parentElement;
          depth++;
        }
        return null;
      }, candidate);

      if (handle.asElement()) {
        const replyBtn = handle.asElement() as ElementHandle<Element>;

        // Scroll and Click
        await replyBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await randomDelay(500, 1000);

        console.log(`↩️ Found Reply button nearby! Clicking...`);
        await replyBtn.click();
        found = true;
        return;
      }
    }

    if (!found) {
      console.log(`⬇️ Not found yet, scrolling down... (${attempts + 1}/${maxAttempts})`);

      // Robust Scroll Logic
      const scrolled = await page.evaluate(() => {
        // Try multiple container selectors
        const selectors = [
          'div[class*="DivCommentList"]',
          'div[class*="DivCommentContainer"]',
          'div[class*="comment-list"]',
          '#comment-list'
        ];

        let scrollable = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of Array.from(els)) {
            if (el.scrollHeight > el.clientHeight) {
              scrollable = el;
              break;
            }
          }
          if (scrollable) break;
        }

        if (scrollable) {
          console.log('   📜 Scrolling container...');
          scrollable.scrollBy(0, 500);
          return true;
        } else {
          console.log('   📜 Container not found, scrolling Window...');
          window.scrollBy(0, 500);
          return false;
        }
      });

      await randomDelay(1500, 2500);
      attempts++;
    }
  }

  throw new Error(`Could not find comment by user @${targetUsername} after ${maxAttempts} scrolls`);
}


function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  try {
    const path = `/tmp/tiktok-${name}-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`📸 ${path}`);
  } catch { }
}
