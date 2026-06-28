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
  
  // ====== AUTH ======
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await snap(page, '01-home.png');
  
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
  
  const navText = await page.locator('#nav-account').textContent().catch(() => '');
  log('Nav:', navText);
  if (navText.includes('Sign in')) { log('AUTH FAILED'); await browser.close(); return; }
  log('✓ Signed in');
  
  // Remove the toast that blocks clicks
  await page.evaluate(() => {
    const t = document.querySelector('.toast');
    if (t) t.remove();
  });

  // ====== SEASON MODE ======
  log('\n--- Season Mode ---');
  await page.click('#btn-kickoff');
  await page.waitForTimeout(500);
  await snap(page, '02-setup.png');
  await page.click('#btn-start-draft');
  
  for (let r = 0; r < 7; r++) {
    await page.waitForSelector('.pcard', { timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('.pcard').first().click();
    if (r < 6) await page.waitForTimeout(1400);
  }
  await page.waitForTimeout(500);
  await page.waitForSelector('.lineup-head', { timeout: 5000 });
  await page.waitForTimeout(500);
  await snap(page, '03-season-lineup.png');
  
  log(`OVR: ${await page.locator('.ts-ovr b').allTextContents()}`);
  log(`Cats: ${[await page.locator('.ts-cat').allTextContents()]}`);
  log(`Rows: ${await page.locator('.ts-row').count()}`);
  
  await page.click('#lineup-go');
  await page.waitForTimeout(2000);
  await snap(page, '04-season-results.png');
  log(`Verdict: ${await page.locator('.verdict-title').textContent().catch(() => '?')}`);
  log(`Record: ${await page.locator('.verdict-record').textContent().catch(() => '?')}`);
  log(`Cats: ${await page.locator('.cat').count()}`);

  // ====== CPU MODE ======
  log('\n--- CPU Mode ---');
  await page.click('#btn-again');
  await page.waitForTimeout(800);
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
  await page.waitForTimeout(500);
  await page.waitForSelector('.lineup-head', { timeout: 5000 });
  await page.waitForTimeout(300);
  await snap(page, '05-cpu-lineup.png');
  
  log(`Teams: ${await page.locator('.ts-name-big').allTextContents()}`);
  log(`Opp OVR: ${await page.locator('.teamsheet.ts-opp .ts-ovr b').textContent().catch(() => '?')}`);
  log(`Opp Cats: ${await page.locator('.teamsheet.ts-opp .ts-cat b').allTextContents()}`);

  // ====== WATCH MATCH ======
  log('\n--- Watching Match ---');
  await page.locator('#lineup-watch').click();
  await page.waitForTimeout(2000);
  await snap(page, '06-sim-start.png');
  
  log(`Canvas: ${await page.locator('#sim-canvas').isVisible().catch(() => false)}`);
  log(`Head: ${await page.locator('.sim-head').textContent().catch(() => '')}`);
  
  // Remove toast again if it appeared
  await page.evaluate(() => document.querySelector('.toast')?.remove());
  
  // Watch for goal events
  for (let s = 0; s < 8; s++) {
    await page.waitForTimeout(1000);
    const goalEl = page.locator('.goal-overlay.show');
    if (await goalEl.isVisible().catch(() => false)) {
      const gText = (await goalEl.textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
      log(`  ⚽ Goal at ${s+1}s: "${gText}"`);
      await snap(page, `07-goal-${s+1}.png`);
    }
  }
  await snap(page, '08-mid-match.png');

  // ====== SKIP (via JS to bypass toast overlay) ======
  log('\n--- Skip ---');
  let onResults = false;
  let skipTime = 0;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    await page.evaluate(() => {
      document.querySelectorAll('.toast').forEach(el => el.remove());
      const btn = document.querySelector('#btn-skip-sim');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);
    skipTime = Date.now() - t0;
    onResults = await page.locator('.screen--results.is-active').isVisible().catch(() => false);
    if (onResults) break;
  }
  
  log(`Skip time: ${skipTime}ms, On results: ${onResults}`);

  // If not on results, try via the matchsim API
  if (!onResults) {
    log('Trying direct API skip...');
    await page.evaluate(() => {
      if (window.activeSim) window.activeSim.skip();
    });
    await page.waitForTimeout(2000);
  }
  
  await page.waitForTimeout(500);
  
  // ====== RESULTS ======
  log('\n--- Results ---');
  await snap(page, '09-results-full.png');
  
  log(`Scores: ${await page.locator('.sb-score').allTextContents()}`);
  log(`Scorers count: ${await page.locator('.scorer').count()}`);
  log(`Stat rows: ${await page.locator('.st-row').count()}`);
  const ratings = await page.locator('.st-rtg').allTextContents().catch(() => []);
  log(`Ratings sample: ${ratings.slice(0, 5)}`);

  // ====== RAPID CLICK ======
  log('\n--- Rapid Click Test ---');
  await page.click('#btn-again');
  await page.waitForTimeout(500);
  await page.click('.mode-card[data-mode="cpu"]');
  await page.click('#btn-kickoff');
  await page.click('#btn-start-draft');
  await page.waitForTimeout(200);
  
  for (let r = 0; r < 7; r++) {
    try { await page.waitForSelector('.pcard', { timeout: 2000 }); await page.locator('.pcard').first().click({ timeout: 1000 }); } catch(e) {}
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);
  
  await page.locator('#lineup-watch').click();
  await page.waitForTimeout(500);
  
  // Spam skip via JS
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => document.querySelector('#btn-skip-sim')?.click());
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(2000);
  
  const stable = await page.locator('.screen--results.is-active').isVisible().catch(() => false);
  log(`Stable after spam: ${stable}`);
  await snap(page, '10-rapid-spam.png');

  // ====== RESIZE ======
  log('\n--- Resize ---');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await snap(page, '11-mobile.png');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await snap(page, '12-tablet.png');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await snap(page, '13-desktop.png');
  
  log('\n=== EPSILON-01 COMPLETE ===');
  await browser.close();
})();
