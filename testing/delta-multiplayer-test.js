/**
 * DELTA-01: Multiplayer Match Sim Test
 * Tests the full 1v1 flow: invite → lobby → draft → match sim → H2H
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, 'reports', 'delta-screenshots');

const DELTA = { email: 'testdelta@clubchampion.test', password: 'TestSocial2024!', name: 'Delta' };
const EPSILON = { email: 'testepsilon@clubchampion.test', password: 'TestSocial2024!', name: 'Epsilon' };

async function createAccount(page, email, password, username) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  const isSignedIn = await page.evaluate(() => {
    const btn = document.querySelector('#nav-account');
    return btn && btn.classList.contains('is-user');
  });
  if (isSignedIn) {
    await page.evaluate(() => { document.querySelector('#nav-account').click(); });
    await page.waitForTimeout(300);
    const outBtn = page.locator('#acc-out');
    if (await outBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await outBtn.click();
      await page.waitForTimeout(2000);
    }
  }
  
  await page.waitForSelector('#nav-account', { state: 'visible' });
  await page.click('#nav-account');
  await page.waitForSelector('#auth-modal', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  
  // Switch to Create account mode
  const createBtn = page.locator('.auth-seg button[data-m="up"]');
  await createBtn.click();
  await page.waitForTimeout(300);
  
  // Wait for username field to appear
  await page.waitForSelector('#auth-username', { state: 'visible', timeout: 3000 });
  await page.fill('#auth-username', username);
  
  // Wait for username availability check to complete (400ms debounce + network)
  await page.waitForFunction(() => {
    const st = document.querySelector('#auth-uname-status');
    return st && (st.textContent === 'Available' || st.textContent === 'Taken');
  }, { timeout: 15000 });
  
  const isAvailable = await page.evaluate(() => {
    const st = document.querySelector('#auth-uname-status');
    return st && st.textContent === 'Available';
  });
  
  if (!isAvailable) {
    console.log('Username ' + username + ' is taken, trying signin instead');
    // Switch back to sign in mode
    await page.click('.auth-seg button[data-m="in"]');
    await page.waitForTimeout(300);
    await page.fill('#auth-email', email);
    await page.fill('#auth-pass', password);
    await page.click('#auth-submit');
    await page.waitForTimeout(3000);
    return false;
  }
  
  await page.waitForTimeout(200);
  await page.fill('#auth-email', email);
  await page.fill('#auth-pass', password);
  await page.waitForTimeout(200);
  await page.click('#auth-submit');
  
  // Wait for result
  try {
    await page.waitForSelector('#nav-account.is-user', { timeout: 20000 });
    await page.waitForTimeout(1500);
    return true;
  } catch (e) {
    // Check if maybe it said "account exists" and we're now signed in
    const signedIn = await page.evaluate(() => {
      const btn = document.querySelector('#nav-account');
      return btn && btn.classList.contains('is-user');
    });
    if (signedIn) return true;
    console.log('Account creation may have failed, will try signin');
    return false;
  }
}

async function signIn(page, email, password) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  // Check if already signed in
  const isSignedIn = await page.evaluate(() => {
    const btn = document.querySelector('#nav-account');
    return btn && btn.classList.contains('is-user');
  });
  if (isSignedIn) {
    return;
  }
  
  await page.waitForSelector('#nav-account', { state: 'visible' });
  await page.click('#nav-account');
  await page.waitForSelector('#auth-modal', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  
  // Make sure we're in sign-in mode
  const signInTab = page.locator('.auth-seg button[data-m="in"]');
  const sigInSelected = await signInTab.evaluate(el => el.classList.contains('is-selected')).catch(() => false);
  if (!sigInSelected) {
    await signInTab.click();
    await page.waitForTimeout(300);
  }
  
  // Clear and fill email
  await page.fill('#auth-email', '');
  await page.fill('#auth-email', email);
  await page.fill('#auth-pass', password);
  await page.waitForTimeout(200);
  await page.click('#auth-submit');
  
  // Wait for nav-account to get .is-user class
  try {
    await page.waitForSelector('#nav-account.is-user', { timeout: 20000 });
    await page.waitForTimeout(1000);
  } catch (e) {
    // Check for error message
    const errText = await page.evaluate(() => {
      const err = document.querySelector('#auth-err');
      return err ? err.textContent : null;
    });
    // Check if we're already signed in via other means
    const signedIn = await page.evaluate(() => {
      const btn = document.querySelector('#nav-account');
      return btn && btn.classList.contains('is-user');
    });
    if (signedIn) return;
    throw new Error('Sign in failed: ' + (errText || e.message));
  }
}

async function goHome(page) {
  // Try MP results Return Home button first
  const homeBtn = page.locator('#mp-home');
  if (await homeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await homeBtn.click();
    await page.waitForTimeout(1500);
    return;
  }
  // Try solo results Play again button
  const againBtn = page.locator('#btn-again');
  if (await againBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await againBtn.click();
    await page.waitForTimeout(1500);
  }
}

async function navigateToFriends(page) {
  await goHome(page);
  try {
    await page.click('.nav-tab[data-tab="friends"]', { timeout: 5000 });
  } catch (e) {
    await page.waitForTimeout(1000);
    await page.click('.nav-tab[data-tab="friends"]');
  }
  await page.waitForTimeout(1500);
}

async function sendFriendRequest(fromPage, username) {
  try {
    await fromPage.fill('#friend-search', username);
    await fromPage.click('#friend-add-btn');
    await fromPage.waitForFunction(() => {
      const msg = document.querySelector('#friend-msg');
      return msg && (msg.textContent.includes('Request sent') || msg.textContent.includes('already'));
    }, { timeout: 8000 });
  } catch (e) {
    console.log('Friend request may have already been sent:', e.message);
  }
}

async function acceptFriendRequest(page) {
  try {
    const acceptBtn = page.locator('#friend-incoming [data-acc]').first();
    await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
    await acceptBtn.click();
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log('No friend request to accept (may already be friends):', e.message);
  }
}

async function sendGameInvite(fromPage) {
  try {
    const challengeBtn = fromPage.locator('[data-play]').first();
    await challengeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await challengeBtn.click();
    await fromPage.waitForSelector('#invite-pop', { state: 'visible', timeout: 3000 });
    await fromPage.waitForTimeout(500);
    await fromPage.click('#ip-send');
    await fromPage.waitForTimeout(3000);
  } catch (e) {
    console.log('Could not send game invite:', e.message);
  }
}

async function acceptGameInvite(page) {
  try {
    const acceptInv = page.locator('#game-invites [data-acc-inv]').first();
    await acceptInv.waitFor({ state: 'visible', timeout: 10000 });
    await acceptInv.click();
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('Could not accept game invite:', e.message);
  }
}

async function pickFormationAndReady(page) {
  // Wait for the lobby to show
  try {
    await page.waitForSelector('#mpl-fgrid', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Click the first formation card
    const formation = page.locator('#mpl-fgrid .formation-card').first();
    await formation.waitFor({ state: 'visible', timeout: 3000 });
    await formation.click();
    await page.waitForTimeout(1000);
    
    // Click ready up
    const readyBtn = page.locator('#mpl-ready');
    await readyBtn.waitFor({ state: 'visible', timeout: 3000 });
    if (!await readyBtn.isDisabled()) {
      await readyBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log('Could not pick formation/ready:', e.message);
  }
}

async function waitForFirstPickReveal(page) {
  try {
    // Check if we're already past the reveal phase (the draft might have started)
    const inDraft = await page.locator('#mp-players').isVisible().catch(() => false);
    if (inDraft) return;
    
    // Check if we're already in match sim
    const inMatch = await page.locator('#mp-canvas').isVisible().catch(() => false);
    if (inMatch) return;
    
    await page.waitForSelector('#fp-reel-text', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(6000); // Let the reel animation + countdown complete
  } catch (e) {
    console.log('First pick reveal may have already passed:', e.message);
  }
}

async function autoPickWhenMyTurn(page, label) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Check if we're still in draft phase
      const screen = await page.evaluate(() => document.body.dataset.screen);
      if (screen !== 'mplobby') {
        console.log(`${label}: No longer in lobby (screen=${screen}), stopping draft picks`);
        return 'done';
      }
      
      // Check for match/lineup screen
      const inMatch = await page.locator('#mp-canvas').isVisible().catch(() => false);
      const inLineup = await page.locator('.lineup-head').isVisible().catch(() => false);
      if (inMatch || inLineup) {
        console.log(`${label}: Match already started, stopping draft`);
        return 'done';
      }
      
      const titleEl = page.locator('.mpl-title');
      const titleText = await titleEl.textContent().catch(() => '');
      
      if (titleText && titleText.includes('Your turn')) {
        // It's my turn - pick the first available player
        const cards = page.locator('#mp-players button:not([disabled])');
        const count = await cards.count();
        if (count > 0) {
          console.log(`${label}: Picking player (${count} available)`);
          await cards.first().click();
          await page.waitForTimeout(2000);
          return 'picked';
        }
      }
      
      // Check if it says opponent's turn - wait
      if (titleText && (titleText.includes("turn") || titleText.includes("Watching"))) {
        await page.waitForTimeout(1500);
        continue;
      }
      
      // If no title found yet (loading between phases)
      await page.waitForTimeout(1000);
      
    } catch (e) {
      await page.waitForTimeout(1000);
    }
  }
  return 'timeout';
}

async function waitForMatchSim(page) {
  await page.waitForSelector('#mp-canvas', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function skipMatchSim(page) {
  const skipBtn = page.locator('#mp-sim-skip');
  if (await skipBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await skipBtn.click();
      await page.waitForTimeout(1000);
    }
}

async function waitForResults(page) {
  await page.waitForSelector('.results-wrap', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function checkH2H(page) {
  const h2h = page.locator('#mp-h2h');
  if (await h2h.isVisible({ timeout: 3000 }).catch(() => false)) {
    return await h2h.textContent();
  }
  return null;
}

async function takeScreenshot(page, name) {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name), fullPage: false });
}

async function waitForLobbyPage(page, timeout = 15000) {
  try {
    await page.waitForSelector('#mpl-wrap', { state: 'visible', timeout });
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  let deltaPage, epsilonPage, contextDelta, contextEpsilon;
  
  try {
    // Create two browser contexts (isolated storage)
    contextDelta = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contextEpsilon = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    
    deltaPage = await contextDelta.newPage();
    epsilonPage = await contextEpsilon.newPage();

    console.log('=== DELTA-01: Multiplayer Match Sim Test ===\n');

    // =========================================================
    // PHASE 1: Create both accounts (if needed) then sign in
    // =========================================================
    console.log('[1/8] Creating Delta account...');
    const deltaCreated = await createAccount(deltaPage, DELTA.email, DELTA.password, 'testdelta');
    console.log('Delta account created: ' + deltaCreated);
    
    // Sign out if successfully created
    if (deltaCreated) {
      // Click nav account to get menu
      await deltaPage.evaluate(() => { document.querySelector('#nav-account').click(); });
      await deltaPage.waitForTimeout(500);
      const outBtn = deltaPage.locator('#acc-out');
      if (await outBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await outBtn.click();
        await deltaPage.waitForTimeout(2000);
      }
    } else {
      // Close auth modal if it's still open
      await deltaPage.evaluate(() => {
        const m = document.querySelector('#auth-modal');
        if (m) m.remove();
      }).catch(() => {});
    }
    
    console.log('[1/8] Creating Epsilon account...');
    const epsilonCreated = await createAccount(epsilonPage, EPSILON.email, EPSILON.password, 'testepsilon');
    console.log('Epsilon account created: ' + epsilonCreated);
    
    if (epsilonCreated) {
      await epsilonPage.evaluate(() => { document.querySelector('#nav-account').click(); });
      await epsilonPage.waitForTimeout(500);
      const outBtn = epsilonPage.locator('#acc-out');
      if (await outBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await outBtn.click();
        await epsilonPage.waitForTimeout(2000);
      }
    } else {
      await epsilonPage.evaluate(() => {
        const m = document.querySelector('#auth-modal');
        if (m) m.remove();
      }).catch(() => {});
    }
    
    // Now sign in both
    console.log('[1/8] Signing in Delta...');
    await signIn(deltaPage, DELTA.email, DELTA.password);
    await takeScreenshot(deltaPage, '01-delta-signed-in.png');
    
    console.log('[1/8] Signing in Epsilon...');
    await signIn(epsilonPage, EPSILON.email, EPSILON.password);
    await takeScreenshot(epsilonPage, '01-epsilon-signed-in.png');

    // =========================================================
    // PHASE 2: Friends Flow
    // =========================================================
    console.log('[2/8] Navigating to Friends tab - both...');
    await navigateToFriends(deltaPage);
    await navigateToFriends(epsilonPage);
    await takeScreenshot(deltaPage, '02-delta-friends-tab.png');
    await takeScreenshot(epsilonPage, '02-epsilon-friends-tab.png');

    // Get Epsilon's username from the page
    const epsilonUsername = await epsilonPage.evaluate(() => {
      const btn = document.querySelector('#nav-account .acc-name');
      return btn ? btn.textContent.trim() : null;
    });
    console.log(`Epsilon username: ${epsilonUsername}`);

    // Delta sends friend request to Epsilon
    console.log('[2/8] Delta sending friend request to Epsilon...');
    await sendFriendRequest(deltaPage, epsilonUsername || 'testepsilon');
    await takeScreenshot(deltaPage, '03-delta-friend-request-sent.png');

    // Wait for Epsilon to see the incoming request
    await epsilonPage.waitForTimeout(2000);

    // Refresh Epsilon's friends page
    await navigateToFriends(epsilonPage);
    await takeScreenshot(epsilonPage, '04-epsilon-incoming-request.png');

    // Epsilon accepts
    console.log('[2/8] Epsilon accepting friend request...');
    await acceptFriendRequest(epsilonPage, epsilonUsername);
    await takeScreenshot(epsilonPage, '05-epsilon-friend-accepted.png');

    // Verify Delta sees the friend
    await deltaPage.waitForTimeout(2000);
    await navigateToFriends(deltaPage);
    await takeScreenshot(deltaPage, '06-delta-friend-list.png');

    // =========================================================
    // PHASE 3: Game Invite
    // =========================================================
    console.log('[3/8] Delta sending game invite to Epsilon...');
    await sendGameInvite(deltaPage);
    await takeScreenshot(deltaPage, '07-delta-sent-invite.png');
    
    // Wait for Epsilon to see the invite
    await epsilonPage.waitForTimeout(3000);
    
    // Refresh Epsilon's friends to see the invite
    await navigateToFriends(epsilonPage);
    await takeScreenshot(epsilonPage, '08-epsilon-sees-invite.png');

    // Epsilon accepts game invite
    console.log('[4/8] Epsilon accepting game invite...');
    await acceptGameInvite(epsilonPage);
    
    // Wait for lobby to load on both
    console.log('[4/8] Waiting for lobby on both...');
    
    // Both should now be in the lobby
    const deltaInLobby = await waitForLobbyPage(deltaPage);
    const epsilonInLobby = await waitForLobbyPage(epsilonPage);
    
    console.log(`Delta in lobby: ${deltaInLobby}, Epsilon in lobby: ${epsilonInLobby}`);
    
    if (!deltaInLobby || !epsilonInLobby) {
      console.log('Lobby not found on one or both clients, checking current state...');
      console.log(`Delta URL: ${deltaPage.url()}`);
      console.log(`Epsilon URL: ${epsilonPage.url()}`);
      // Try taking a debug screenshot
      await takeScreenshot(deltaPage, 'debug-delta-state.png');
      await takeScreenshot(epsilonPage, 'debug-epsilon-state.png');
    }

    // =========================================================
    // PHASE 5: Formation & Ready
    // =========================================================
    console.log('[5/8] Picking formations and readying up...');
    
    // Wait a moment for the lobby to fully load
    await deltaPage.waitForTimeout(2000);
    await epsilonPage.waitForTimeout(2000);
    
    await pickFormationAndReady(deltaPage);
    await takeScreenshot(deltaPage, '09-delta-ready.png');
    
    await pickFormationAndReady(epsilonPage);
    await takeScreenshot(epsilonPage, '10-epsilon-ready.png');
    
    // =========================================================
    // PHASE 6: First Pick Reveal
    // =========================================================
    console.log('[6/8] Watching first-pick reveal animation...');
    await takeScreenshot(deltaPage, '11-delta-lobby-both-ready.png');
    await takeScreenshot(epsilonPage, '12-epsilon-lobby-both-ready.png');
    
    // Wait for the first-pick reveal
    await waitForFirstPickReveal(deltaPage);
    await epsilonPage.waitForTimeout(6000);
    
    await takeScreenshot(deltaPage, '13-delta-reveal.png');
    await takeScreenshot(epsilonPage, '14-epsilon-reveal.png');
    
    // =========================================================
    // PHASE 7: Draft
    // =========================================================
    console.log('[7/8] Starting draft...');
    
    // Determine who picks first
    const deltaFirstPick = await deltaPage.evaluate(() => {
      const el = document.querySelector('#fp-winner-name');
      return el ? el.textContent.trim() : null;
    });
    const epsilonFirstPick = await epsilonPage.evaluate(() => {
      const el = document.querySelector('#fp-winner-name');
      return el ? el.textContent.trim() : null;
    });
    
    console.log(`First picker (Delta view): ${deltaFirstPick}`);
    console.log(`First picker (Epsilon view): ${epsilonFirstPick}`);
    
    // Wait for draft screen
    await deltaPage.waitForTimeout(3000);
    await epsilonPage.waitForTimeout(3000);
    
    await takeScreenshot(deltaPage, '15-delta-draft-start.png');
    await takeScreenshot(epsilonPage, '16-epsilon-draft-start.png');
    
    // Do the draft - up to 14 picks total (7 rounds x 2 players)
    console.log('Executing draft picks (up to 14 rounds)...');
    
    // Determine who picks first
    const deltaName = await deltaPage.evaluate(() => {
      const el = document.querySelector('#nav-account .acc-name');
      return el ? el.textContent.trim() : null;
    });
    
    for (let round = 0; round < 14; round++) {
      console.log(`Draft round ${round + 1}/14`);
      
      // Let Delta auto-pick if it's their turn
      const deltaResult = await autoPickWhenMyTurn(deltaPage, 'Delta');
      if (deltaResult === 'done') break;
      
      // Let Epsilon auto-pick if it's their turn
      const epsilonResult = await autoPickWhenMyTurn(epsilonPage, 'Epsilon');
      if (epsilonResult === 'done') break;
      
      // Take screenshot every few rounds
      if (round % 2 === 0) {
        await takeScreenshot(deltaPage, `17-delta-draft-r${Math.floor(round / 2) + 1}.png`);
        await takeScreenshot(epsilonPage, `18-epsilon-draft-r${Math.floor(round / 2) + 1}.png`);
      }
      
      // Check if draft is complete (no longer seeing the draft title)
      const draftStillActive = await deltaPage.evaluate(() => {
        const t = document.querySelector('.mpl-title');
        return t && (t.textContent.includes('turn') || t.textContent.includes('turn') || t.textContent.includes('Watching'));
      }).catch(() => false);
      
      if (!draftStillActive) {
        console.log('Draft appears complete');
        break;
      }
      
      await deltaPage.waitForTimeout(1000);
    }
    
    // =========================================================
    // PHASE 8: Match Sim
    // =========================================================
    console.log('[8/8] Match simulation starting...');
    
    // Wait for lineup / match sim
    await deltaPage.waitForTimeout(5000);
    await epsilonPage.waitForTimeout(5000);
    
    // Wait for the match sim canvas on both
    try {
      await deltaPage.waitForSelector('#mp-canvas', { state: 'visible', timeout: 20000 });
      console.log('Delta match sim canvas loaded');
    } catch (e) {
      console.log('Delta canvas not found - checking current state');
      // Check if we're on a different screen
      const deltaScreen = await deltaPage.evaluate(() => document.body.dataset.screen);
      console.log(`Delta screen: ${deltaScreen}`);
    }
    
    try {
      await epsilonPage.waitForSelector('#mp-canvas', { state: 'visible', timeout: 20000 });
      console.log('Epsilon match sim canvas loaded');
    } catch (e) {
      console.log('Epsilon canvas not found - checking current state');
      const epsilonScreen = await epsilonPage.evaluate(() => document.body.dataset.screen);
      console.log(`Epsilon screen: ${epsilonScreen}`);
    }
    
    await takeScreenshot(deltaPage, '19-delta-match-sim.png');
    await takeScreenshot(epsilonPage, '20-epsilon-match-sim.png');
    
    // Observe match sim on both windows
    console.log('Observing match sim on both windows...');
    const matchObsDelta = await deltaPage.evaluate(() => {
      const canvas = document.querySelector('#mp-canvas');
      const simHead = document.querySelector('.sim-head');
      return { hasCanvas: !!canvas, headText: simHead ? simHead.textContent : 'none' };
    });
    const matchObsEps = await epsilonPage.evaluate(() => {
      const canvas = document.querySelector('#mp-canvas');
      const simHead = document.querySelector('.sim-head');
      return { hasCanvas: !!canvas, headText: simHead ? simHead.textContent : 'none' };
    });
    console.log(`Delta match obs: canvas=${matchObsDelta.hasCanvas} score=${matchObsDelta.score}`);
    console.log(`Epsilon match obs: canvas=${matchObsEps.hasCanvas} score=${matchObsEps.score}`);
    console.log(`Score sync: ${matchObsDelta.score === matchObsEps.score ? 'MATCH' : 'DESYNCED'}`);
    
    // Let the match sim run for a moment
    await deltaPage.waitForTimeout(3000);
    await epsilonPage.waitForTimeout(3000);
    
    await takeScreenshot(deltaPage, '21-delta-match-mid.png');
    await takeScreenshot(epsilonPage, '22-epsilon-match-mid.png');
    
    // Check score again mid-match
    const midScoreD = await deltaPage.evaluate(() => {
      const s = document.querySelector('.sim-head');
      return s ? s.textContent : 'none';
    }).catch(() => 'error');
    const midScoreE = await epsilonPage.evaluate(() => {
      const s = document.querySelector('.sim-head');
      return s ? s.textContent : 'none';
    }).catch(() => 'error');
    console.log(`Mid-match score Delta: ${midScoreD}, Epsilon: ${midScoreE}`);
    console.log(`Mid-match sync: ${midScoreD === midScoreE ? 'MATCH' : 'DESYNCED'}`);
    
    // Skip to result on Delta
    console.log('Skipping to result on Delta...');
    await skipMatchSim(deltaPage);
    await deltaPage.waitForTimeout(2000);
    
    // The other should also auto-advance (or we skip there too)
    await epsilonPage.waitForTimeout(3000);
    
    // Try skipping on Epsilon if results not shown yet
    const epsilonInResults = await epsilonPage.locator('.results-wrap').isVisible().catch(() => false);
    if (!epsilonInResults) {
      await skipMatchSim(epsilonPage);
      await epsilonPage.waitForTimeout(2000);
    }
    
    // Wait for results on both
    await waitForResults(deltaPage);
    await waitForResults(epsilonPage);
    
    await takeScreenshot(deltaPage, '23-delta-results.png');
    await takeScreenshot(epsilonPage, '24-epsilon-results.png');
    
    // Check H2H on results screen
    const deltaH2H = await checkH2H(deltaPage);
    const epsilonH2H = await checkH2H(epsilonPage);
    console.log(`Delta H2H: ${deltaH2H}`);
    console.log(`Epsilon H2H: ${epsilonH2H}`);
    
    // Compare results
    const deltaScore = await deltaPage.evaluate(() => {
      const s = document.querySelector('.verdict-record');
      return s ? s.textContent : document.querySelector('.sim-head') ? document.querySelector('.sim-head').textContent : 'unknown';
    }).catch(() => 'error');
    const epsilonScore = await epsilonPage.evaluate(() => {
      const s = document.querySelector('.verdict-record');
      return s ? s.textContent : document.querySelector('.sim-head') ? document.querySelector('.sim-head').textContent : 'unknown';
    }).catch(() => 'error');
    console.log(`Result scores - Delta: ${deltaScore}, Epsilon: ${epsilonScore}`);
    console.log(`Result sync: ${deltaScore === epsilonScore ? 'MATCH' : 'DESYNCED'}`);
    
    // =========================================================
    // PHASE 9: H2H Record Check in Friends Tab
    // =========================================================
    console.log('Checking H2H in Friends tab...');
    await navigateToFriends(deltaPage);
    await deltaPage.waitForTimeout(2000);
    await takeScreenshot(deltaPage, '25-delta-friends-h2h.png');
    
    await navigateToFriends(epsilonPage);
    await epsilonPage.waitForTimeout(2000);
    await takeScreenshot(epsilonPage, '26-epsilon-friends-h2h.png');
    
    // =========================================================
    // PHASE 10: Rematch Flow
    // =========================================================
    console.log('Testing rematch flow...');
    // Try rematch from Delta side
    const rematchBtn = deltaPage.locator('#mp-rematch');
    if (await rematchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Delta clicking rematch...');
      await rematchBtn.click();
      await deltaPage.waitForTimeout(2000);
      await takeScreenshot(deltaPage, '27-delta-rematch-sent.png');
    }
    
    // Epsilon sees rematch request
    const epsRematchBtn = epsilonPage.locator('#mp-rematch');
    if (await epsRematchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Epsilon clicking rematch...');
      await epsRematchBtn.click();
      await epsilonPage.waitForTimeout(3000);
      await takeScreenshot(epsilonPage, '28-epsilon-rematch-accepted.png');
    } else {
      // Check for accept button
      const acceptRematch = epsilonPage.locator('#mp-accept-rematch');
      if (await acceptRematch.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Epsilon sees accept rematch button, clicking...');
        await acceptRematch.click();
        await epsilonPage.waitForTimeout(3000);
        await takeScreenshot(epsilonPage, '28-epsilon-rematch-accepted.png');
      }
    }
    
    // Wait for both to be back in lobby
    await deltaPage.waitForTimeout(3000);
    await epsilonPage.waitForTimeout(3000);
    
    const deltaInLobby2 = await waitForLobbyPage(deltaPage, 5000);
    const epsilonInLobby2 = await waitForLobbyPage(epsilonPage, 5000);
    console.log(`Delta in lobby after rematch: ${deltaInLobby2}`);
    console.log(`Epsilon in lobby after rematch: ${epsilonInLobby2}`);
    if (deltaInLobby2) await takeScreenshot(deltaPage, '29-delta-rematch-lobby.png');
    if (epsilonInLobby2) await takeScreenshot(epsilonPage, '30-epsilon-rematch-lobby.png');
    
    console.log('\n=== Test Complete ===');
    
  } catch (err) {
    console.error('Test error:', err.message);
    console.error(err.stack);
    // Take error screenshots on any available pages
    try {
      const pages = browser.contexts().flatMap(ctx => ctx.pages());
      for (const page of pages) {
        try {
          await takeScreenshot(page, `error-${Date.now()}.png`);
        } catch (e) {}
      }
    } catch (e) {}
  } finally {
    try {
      if (contextDelta) await contextDelta.close();
      if (contextEpsilon) await contextEpsilon.close();
      await browser.close();
    } catch (e) {}
  }
})();
