import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:/Users/pbroa/AI Projects/ClubChampion/testing/epsilon-screenshots';
const EMAIL = 'testepsilonui@clubchampion.test';
const PASSWORD = 'TestUI2024!';
const USERNAME = 'EpsilonUI';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [PAGE ERROR]', msg.text());
  });

  console.log('=== EPSILON-01: Match Sim UI/UX Test ===\n');

  // -----------------------------------------------------------
  // STEP 1: Go to app
  // -----------------------------------------------------------
  console.log('1. Navigating to app...');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-home.png') });
  console.log('   Homepage loaded.');

  // -----------------------------------------------------------
  // STEP 2: Sign up / Sign in
  // -----------------------------------------------------------
  console.log('\n2. Opening auth modal...');
  
  // Click "Sign in" to open auth modal
  await page.click('#nav-account');
  await sleep(800);
  
  // Check if auth modal opened
  const authModal = page.locator('#auth-modal');
  if (await authModal.isVisible().catch(() => false)) {
    console.log('   Auth modal opened.');
    
    // See what mode we're in - if sign-in, switch to create account mode
    const createBtn = authModal.locator('button[data-m="up"]');
    if (await createBtn.isVisible().catch(() => false)) {
      console.log('   Switching to Create account mode...');
      await createBtn.click();
      await sleep(300);
    }
    
    // Fill email
    const emailInput = page.locator('#auth-email');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(EMAIL);
    }
    
    // Fill password
    const passInput = page.locator('#auth-pass');
    if (await passInput.isVisible().catch(() => false)) {
      await passInput.fill(PASSWORD);
    }
    
    // Fill username if visible (sign-up mode)
    const unameInput = page.locator('#auth-username');
    if (await unameInput.isVisible().catch(() => false)) {
      await unameInput.fill(USERNAME);
      await sleep(600); // Wait for availability check
    }
    
    // Click submit
    const submitBtn = page.locator('#auth-submit');
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await sleep(3000);
      console.log('   Auth submitted.');
    }
    
    // Check for error
    const errDiv = page.locator('#auth-err');
    const errText = await errDiv.textContent().catch(() => '');
    if (errText) console.log('   Auth error:', errText);
  } else {
    console.log('   Auth modal did not open.');
  }
  
  // Check if we're signed in
  await sleep(1500);
  const navAccount = page.locator('#nav-account');
  const navText = await navAccount.textContent().catch(() => '');
  console.log('   Nav text:', navText.trim());
  
  if (navText.includes('Sign in')) {
    console.log('   Sign-up probably failed (account may exist). Trying sign-in...');
    // Close any existing modal
    const closeBtn = page.locator('#auth-close');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await sleep(300);
    }
    
    // Re-open
    await page.click('#nav-account');
    await sleep(500);
    
    // Make sure we're in sign-in mode
    const signInTab = page.locator('#auth-modal button[data-m="in"]');
    if (await signInTab.isVisible().catch(() => false)) {
      await signInTab.click();
      await sleep(200);
    }
    
    // Fill
    await page.locator('#auth-email').fill(EMAIL);
    await page.locator('#auth-pass').fill(PASSWORD);
    await page.locator('#auth-submit').click();
    await sleep(3000);
    
    const navText2 = await page.locator('#nav-account').textContent().catch(() => '');
    console.log('   Nav after sign-in:', navText2.trim());
  }
  
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-after-auth.png') });
  
  // -----------------------------------------------------------
  // STEP 3: Season mode - draft flow (for lineup screen)
  // -----------------------------------------------------------
  console.log('\n3. Starting Season mode flow...');
  
  // Season should already be selected
  await page.click('#btn-kickoff');
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-setup-screen.png') });
  
  // Click START DRAFT
  await page.click('#btn-start-draft');
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-draft-start.png') });
  
  // Draft 7 players
  for (let round = 0; round < 7; round++) {
    const firstCard = page.locator('.pcard').first();
    const cardVisible = await firstCard.isVisible().catch(() => false);
    if (!cardVisible) {
      console.log(`   No player cards at round ${round + 1}`);
      break;
    }
    const playerName = await firstCard.locator('.pcard-name').textContent().catch(() => '?');
    await firstCard.click();
    await sleep(800);
    console.log(`   Round ${round + 1}/7: Picked ${playerName}`);
  }
  
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-after-draft.png') });
  
  // -----------------------------------------------------------
  // STEP 4: Pre-match Lineup Screen (Season - solo)
  // -----------------------------------------------------------
  console.log('\n4. Examining pre-match lineup screen (Season mode)...');
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-lineup-season.png') });
  
  // Check team ratings
  const teamRatings = page.locator('.ts-ovr b');
  const catRatings = page.locator('.ts-cat b');
  console.log('   Team OVR elements:', await teamRatings.count());
  console.log('   Category ratings:', await catRatings.count());
  
  // Check if ratings display values
  const ovrValues = await teamRatings.allTextContents().catch(() => []);
  console.log('   OVR values:', ovrValues);
  
  // Check player rows
  const tsRows = page.locator('.ts-row');
  console.log('   Team sheet rows:', await tsRows.count());
  
  const tsNames = page.locator('.ts-name');
  await tsNames.first().isVisible().then(v => console.log('   Player names visible:', v));
  
  // Check for text overflow
  const overflow = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('.ts-name').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 2) issues.push(el.textContent.trim());
    });
    return issues;
  });
  if (overflow.length > 0) {
    console.log('   ⚠ TEXT OVERFLOW in:', overflow);
  } else {
    console.log('   ✓ No text overflow in lineup.');
  }
  
  // -----------------------------------------------------------
  // STEP 5: Season results (simulated, no animation)
  // -----------------------------------------------------------
  console.log('\n5. Checking season simulation results...');
  
  const simBtn = page.locator('#lineup-go');
  if (await simBtn.isVisible().catch(() => false)) {
    await simBtn.click();
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-season-results.png') });
    console.log('   Season results page loaded.');
  }
  
  // Check verdict display
  const verdict = page.locator('.verdict-title');
  const verdictText = await verdict.textContent().catch(() => 'N/A');
  console.log('   Verdict:', verdictText.trim());
  
  const record = page.locator('.verdict-record');
  const recordText2 = await record.textContent().catch(() => 'N/A');
  console.log('   Record:', recordText2.trim());
  
  const catCards = page.locator('.cat');
  console.log('   Category bars:', await catCards.count());
  
  // -----------------------------------------------------------
  // STEP 6: Now test LIVE match simulation via CPU mode
  // -----------------------------------------------------------
  console.log('\n6. Starting CPU mode for LIVE match animation...');
  
  // Go back to home
  const again = page.locator('#btn-again');
  if (await again.isVisible().catch(() => false)) {
    await again.click();
    await sleep(800);
  }
  
  // Select CPU mode
  await page.click('.mode-card[data-mode="cpu"]');
  await sleep(200);
  await page.click('#btn-kickoff');
  await sleep(500);
  await page.click('#btn-start-draft');
  await sleep(1000);
  
  // Draft 7 players for CPU mode
  for (let r = 0; r < 7; r++) {
    const card = page.locator('.pcard').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await sleep(600);
    }
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-cpu-lineup.png') });
  
  // Check lineup for CPU (both teams visible)
  const teamSheets = page.locator('.teamsheet');
  console.log('   Team sheets visible:', await teamSheets.count());
  
  const oppNames = page.locator('.ts-name-big');
  const oppTexts = await oppNames.allTextContents().catch(() => []);
  console.log('   Teams:', oppTexts);
  
  // -----------------------------------------------------------
  // STEP 7: WATCH match animation
  // -----------------------------------------------------------
  console.log('\n7. WATCHING match animation...');
  
  const watchBtn = page.locator('#lineup-watch');
  if (await watchBtn.isVisible().catch(() => false)) {
    await watchBtn.click();
    await sleep(1000);
    console.log('   Sim started.');
    
    // Wait for animation to play for a bit
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-mid-match.png') });
    
    // Check canvas
    const canvas = page.locator('#sim-canvas');
    const canvasVisible = await canvas.isVisible().catch(() => false);
    console.log('   Canvas visible:', canvasVisible);
    
    // Watch for animation quality
    const simHead = page.locator('.sim-head');
    const simHeadText = await simHead.textContent().catch(() => 'N/A');
    console.log('   Sim header:', simHeadText.trim());
    
    // Wait longer for potential events (goals, banners)
    console.log('   Waiting for animation events (5s)...');
    
    // Check for goal overlay during animation
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      
      const goalOverlay = page.locator('.goal-overlay.show');
      if (await goalOverlay.isVisible().catch(() => false)) {
        const goalText = await goalOverlay.textContent().catch(() => '');
        console.log(`   ⚽ GOAL OVERLAY visible at ${i + 1}s:`, goalText.trim());
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `10-goal-${i + 1}.png`) });
      }
      
      // Check for banner
      const bannerEl = page.locator('.sim-stage').locator('canvas');
      // Can't read canvas content easily, skip
    }
    
    // Test skip behavior
    console.log('\n8. Testing SKIP behavior...');
    const skipBtn = page.locator('#btn-skip-sim');
    if (await skipBtn.isVisible().catch(() => false)) {
      console.log('   Clicking skip...');
      const start = Date.now();
      await skipBtn.click();
      // Check if double-click causes issues
      await sleep(100);
      await skipBtn.click();
      console.log('   Skip clicked (double-click test).');
      await sleep(1500);
      console.log('   Time to results:', (Date.now() - start) + 'ms');
    }
    
    // -----------------------------------------------------------
    // STEP 9: Post-match results
    // -----------------------------------------------------------
    console.log('\n9. Examining post-match results...');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-post-match-results.png') });
    
    // Check scoreboard
    const sbName = page.locator('.sb-name');
    console.log('   Scoreboard team names:', await sbName.count());
    
    const sbScore = page.locator('.sb-score');
    const scores = await sbScore.allTextContents().catch(() => []);
    console.log('   Score:', scores.join(' '));
    
    // Check scorers
    const scorerEls = page.locator('.scorer');
    console.log('   Scorers:', await scorerEls.count());
    
    // Check player stat rows
    const statRows = page.locator('.st-row');
    console.log('   Player stat rows:', await statRows.count());
    
    // Check for rating values
    const ratings = page.locator('.st-rtg');
    const ratingVals = await ratings.allTextContents().catch(() => []);
    console.log('   Ratings sample:', ratingVals.slice(0, 3));
  }
  
  // -----------------------------------------------------------
  // STEP 10: Edge cases - rapid clicking, skip spam
  // -----------------------------------------------------------
  console.log('\n10. Testing edge cases...');
  
  // Start another CPU game, rapidly skip through
  const again2 = page.locator('#btn-again');
  if (await again2.isVisible().catch(() => false)) {
    await again2.click();
    await sleep(300);
    
    // Rapid mode selection
    await page.click('.mode-card[data-mode="cpu"]');
    await page.click('#btn-kickoff');
    await sleep(100);
    await page.click('#btn-start-draft');
    await sleep(300);
    
    // Rapid draft
    for (let r = 0; r < 7; r++) {
      const card = page.locator('.pcard').first();
      if (await card.isVisible().catch(() => false)) {
        await card.click();
        await sleep(100);
      }
    }
    await sleep(500);
    
    // Click watch then rapidly spam skip
    const watchBtn2 = page.locator('#lineup-watch');
    if (await watchBtn2.isVisible().catch(() => false)) {
      await watchBtn2.click();
      await sleep(500);
      
      const skipBtn2 = page.locator('#btn-skip-sim');
      if (await skipBtn2.isVisible().catch(() => false)) {
        // Spam skip rapidly
        for (let i = 0; i < 10; i++) {
          await skipBtn2.click();
          await sleep(30);
        }
        console.log('   Rapid skip spam test done.');
        await sleep(1000);
      }
    }
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-rapid-skip-test.png') });
    console.log('   Rapid skip test screenshot taken.');
  }
  
  // -----------------------------------------------------------
  // STEP 11: Resize during match
  // -----------------------------------------------------------
  console.log('\n11. Testing responsive resize during sim...');
  
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(500);
  
  await page.click('.mode-card[data-mode="cpu"]');
  await page.click('#btn-kickoff');
  await sleep(100);
  await page.click('#btn-start-draft');
  await sleep(200);
  
  for (let r = 0; r < 7; r++) {
    const card = page.locator('.pcard').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await sleep(200);
    }
  }
  await sleep(500);
  
  const watchBtn3 = page.locator('#lineup-watch');
  if (await watchBtn3.isVisible().catch(() => false)) {
    await watchBtn3.click();
    await sleep(2000);
    
    // Resize to mobile during sim
    console.log('   Resizing to 375x667 (mobile)...');
    await page.setViewportSize({ width: 375, height: 667 });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13-mobile-sim.png') });
    
    // Resize to tablet
    console.log('   Resizing to 768x1024 (tablet)...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14-tablet-sim.png') });
    
    // Resize back to desktop
    console.log('   Resizing back to 1280x720...');
    await page.setViewportSize({ width: 1280, height: 720 });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15-desktop-resize-back.png') });
    
    // Skip to result
    await page.locator('#btn-skip-sim').click().catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16-results-after-resize.png') });
  }
  
  console.log('\n=== EPSILON-01 TESTS COMPLETE ===');
  
  await browser.close();
}

main().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
