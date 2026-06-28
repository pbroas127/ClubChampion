import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const DIR = 'C:/Users/pbroa/AI Projects/ClubChampion/testing/epsilon-screenshots';
const EMAIL = 'testepsilonui@clubchampion.test';
const PASS = 'TestUI2024!';

fs.mkdirSync(DIR, { recursive: true });

async function snap(page, name) {
  await page.screenshot({ path: path.join(DIR, name) });
}

;(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await snap(page, '01-home.png');
  console.log('Home loaded');

  // OPEN AUTH
  await page.click('#nav-account');
  await page.waitForTimeout(500);
  await snap(page, '02-auth.png');

  // SIGN IN (account already exists)
  // Make sure on sign-in tab
  await page.click('#auth-modal button[data-m="in"]');
  await page.waitForTimeout(200);
  await page.fill('#auth-email', EMAIL);
  await page.fill('#auth-pass', PASS);
  await snap(page, '03-filled.png');
  await page.click('#auth-submit');
  await page.waitForTimeout(2000);
  await snap(page, '04-after-signin.png');

  // Check for username prompt - the auth modal may be re-used for picking username
  const usernameInput = page.locator('#auth-username');
  if (await usernameInput.isVisible().catch(() => false)) {
    console.log('Username prompt detected. Setting username...');
    await snap(page, '05-username-prompt.png');
    await usernameInput.fill('EpsUI_' + Date.now().toString(36));
    await page.waitForTimeout(800);
    await page.click('#auth-submit');
    await page.waitForTimeout(3000);
    await snap(page, '06-after-username.png');
  }

  // Wait more and check sign-in status
  await page.waitForTimeout(1000);
  const navText = await page.locator('#nav-account').textContent().catch(() => '??');
  console.log('Nav text:', navText);

  if (navText.includes('Sign in')) {
    // Check for auth error
    const err = await page.locator('#auth-err').textContent().catch(() => '');
    console.log('Auth error:', err);
    await snap(page, '07-auth-failed.png');
    
    // Check if modal is open
    const modalVisible = await page.locator('#auth-modal').isVisible().catch(() => false);
    console.log('Modal visible:', modalVisible);
    
    // Try clicking nav again
    if (!modalVisible) {
      await page.click('#nav-account');
      await page.waitForTimeout(500);
    }
    await snap(page, '08-auth-retry.png');
    
    // Try fresh sign-up with new username
    await page.click('#auth-modal button[data-m="up"]');
    await page.waitForTimeout(200);
    await page.fill('#auth-email', EMAIL);
    await page.fill('#auth-pass', PASS);
    const uname = page.locator('#auth-username');
    if (await uname.isVisible()) {
      await uname.fill('FreshUI_' + Date.now().toString(36));
      await page.waitForTimeout(800);
    }
    await snap(page, '09-signup-filled.png');
    await page.click('#auth-submit');
    await page.waitForTimeout(3000);
    await snap(page, '10-signup-result.png');
    
    const nav2 = await page.locator('#nav-account').textContent().catch(() => '');
    console.log('After sign-up nav:', nav2);
    const err2 = await page.locator('#auth-err').textContent().catch(() => '');
    console.log('Sign-up error:', err2);
  }

  console.log('\nAuth handled.');
  await page.waitForTimeout(500);
  
  // Now try to play a game
  // Click Season mode
  await page.click('.mode-card[data-mode="solo"]');
  await page.waitForTimeout(200);
  await page.click('#btn-kickoff');
  await page.waitForTimeout(500);
  await snap(page, '11-setup.png');
  await page.click('#btn-start-draft');
  await page.waitForTimeout(1500);
  await snap(page, '12-draft.png');
  
  // Draft 7 players
  for (let r = 0; r < 7; r++) {
    const card = page.locator('.pcard').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await page.waitForTimeout(800);
    }
  }
  await page.waitForTimeout(1000);
  await snap(page, '13-after-draft.png');
  
  // Lineup
  await page.waitForTimeout(1000);
  await snap(page, '14-lineup.png');
  
  // Season results
  const goBtn = page.locator('#lineup-go');
  if (await goBtn.isVisible().catch(() => false)) {
    await goBtn.click();
    await page.waitForTimeout(2000);
    await snap(page, '15-season-results.png');
  }
  
  // Now CPU mode with live match sim
  const againBtn = page.locator('#btn-again');
  if (await againBtn.isVisible().catch(() => false)) {
    await againBtn.click();
    await page.waitForTimeout(500);
  } else {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  }
  
  await page.click('.mode-card[data-mode="cpu"]');
  await page.waitForTimeout(200);
  await page.click('#btn-kickoff');
  await page.waitForTimeout(300);
  await page.click('#btn-start-draft');
  await page.waitForTimeout(800);
  
  for (let r = 0; r < 7; r++) {
    const card = page.locator('.pcard').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(500);
  await snap(page, '16-cpu-lineup.png');
  
  // Watch match
  const watchBtn = page.locator('#lineup-watch');
  if (await watchBtn.isVisible().catch(() => false)) {
    await watchBtn.click();
    await page.waitForTimeout(3000);
    await snap(page, '17-mid-match.png');
    
    // Watch a bit more
    console.log('Watching match...');
    await page.waitForTimeout(5000);
    await snap(page, '18-mid-match-2.png');
    
    // Skip
    const skipBtn = page.locator('#btn-skip-sim');
    if (await skipBtn.isVisible().catch(() => false)) {
      for (let i = 0; i < 3; i++) {
        await skipBtn.click();
        await page.waitForTimeout(50);
      }
      console.log('Skip spammed');
    }
    
    await page.waitForTimeout(1500);
    await snap(page, '19-results.png');
    
    // Check for scorer info
    const scorers = page.locator('.scorer');
    const scoreboard = page.locator('.sb-score');
    console.log('Scorers:', await scorers.count());
    console.log('Scores visible:', await scoreboard.isVisible().catch(() => false));
  }

  console.log('\n=== TEST COMPLETE ===');
  await browser.close();
})();
