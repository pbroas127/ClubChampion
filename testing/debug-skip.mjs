import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const DIR = 'C:/Users/pbroa/AI Projects/ClubChampion/testing/epsilon-screenshots';
const EMAIL = 'testepsilonui@clubchampion.test';
const PASS = 'TestUI2024!';

fs.mkdirSync(DIR, { recursive: true });
function snap(page, name) { return page.screenshot({ path: path.join(DIR, name) }); }
function log(...args) { console.log(...args); }

;(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  // Auth
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.click('#nav-account');
  await page.waitForTimeout(500);
  await page.click('#auth-modal button[data-m="in"]');
  await page.waitForTimeout(200);
  await page.fill('#auth-email', EMAIL);
  await page.fill('#auth-pass', PASS);
  await page.click('#auth-submit');
  await page.waitForTimeout(3000);
  if (await page.locator('#auth-username').isVisible().catch(() => false)) {
    await page.locator('#auth-username').fill('EpsUI_' + Date.now().toString(36));
    await page.waitForTimeout(800);
    await page.click('#auth-submit');
    await page.waitForTimeout(3000);
  }
  log('Nav:', await page.locator('#nav-account').textContent().catch(() => '?'));

  // Go directly to CPU mode
  await page.click('.mode-card[data-mode="cpu"]');
  await page.waitForTimeout(200);
  await page.click('#btn-kickoff');
  await page.waitForTimeout(300);
  await page.click('#btn-start-draft');
  
  for (let r = 0; r < 7; r++) {
    await page.waitForSelector('.pcard', { timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('.pcard').first().click();
    if (r < 6) await page.waitForTimeout(1400);
  }
  
  await page.waitForSelector('#lineup-watch', { timeout: 5000 });
  await snap(page, '04-lineup.png');
  
  // Check skip button visibility BEFORE even clicking Watch
  // (The button only appears when sim is active, so this might not help)
  
  await page.click('#lineup-watch');
  await page.waitForTimeout(2000);
  await snap(page, '05-sim.png');
  
  // NOW check the skip button
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('#btn-skip-sim');
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    return {
      found: true,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
      position: style.position,
      overflow: style.overflow,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      parentOverflow: btn.parentElement ? window.getComputedStyle(btn.parentElement).overflow : '?',
    };
  });
  log('Button info:', JSON.stringify(btnInfo, null, 2));
  
  // Check what's overlapping the button
  const overlapInfo = await page.evaluate(() => {
    const btn = document.querySelector('#btn-skip-sim');
    if (!btn) return { error: 'no button' };
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);
    return {
      center: { x: centerX, y: centerY },
      topElement: topEl ? {
        tag: topEl.tagName,
        id: topEl.id,
        className: topEl.className,
        text: (topEl.textContent || '').substring(0, 50),
      } : null,
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
    };
  });
  log('Overlap:', JSON.stringify(overlapInfo, null, 2));
  
  // Try using elementFromPoint approach instead
  log('\nUsing JS click...');
  await page.evaluate(() => {
    const btn = document.querySelector('#btn-skip-sim');
    if (btn) btn.click();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const btn = document.querySelector('#btn-skip-sim');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);
  
  log('On results:', await page.locator('.screen--results.is-active').isVisible().catch(() => false));
  await snap(page, '06-after-skip.png');
  
  await browser.close();
  log('\nDone');
})();
