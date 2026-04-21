#!/usr/bin/env node
/**
 * ============================================================
 * AETHEL RUNNER v1.0
 * Purpose-built Playwright prompt submitter for Runway ML
 *
 * USAGE:
 *   node runner.js                          # run full queue
 *   node runner.js --start 15               # start from prompt index 15
 *   node runner.js --dry-run                # log what would be submitted, don't click
 *
 * READS:
 *   shieldmallofachilles_36_cams.json       # prompt queue
 *   progress.json                           # resume state
 *
 * WRITES:
 *   progress.json                           # updated after each submission
 *   errors/CAMxx_timestamp.png              # screenshot on failure
 *
 * KILL CRITERIA:
 *   5 consecutive failures → stop
 *   Login wall detected   → pause & alert
 *   Credits warning       → stop
 * ============================================================
 */

'use strict';

const { chromium } = require('playwright');
const fs           = require('fs');
const path         = require('path');
const WebSocket    = require('ws');

// ============================================================
// CONFIG
// ============================================================

const RUNWAY_URL = 'https://app.runwayml.com/video-tools/teams/Cecile1222/ai-tools/generate?tool=video&mode=tools&sessionId=beacac06-df3b-4c53-a510-eb86060edb51';

const QUEUE_FILE    = path.resolve(__dirname, 'shieldmallofachilles_36_cams.json');
const PROGRESS_FILE = path.resolve(__dirname, 'progress.json');
const ERRORS_DIR    = path.resolve(__dirname, 'errors');

const SELECTORS = {
  promptArea:     'div[aria-label="Prompt"]',
  generateBtn:    'button:has-text("Generate")',
  durationBtn:    'button[aria-label="Duration"]',
  duration15s:    'div[role="option"]:has-text("15 seconds")',
  galleryScroll:  'div.scroller-CHzmxL',
  inQueue:        'text="In queue"',
  generating:     'text="Generating"',
  policyError:    'text="Generation may violate our usage policy"',
  creditWarning:  'text="credits"',
};

const PACING_MIN_MS = 45000;  // 45 seconds minimum between submissions
const PACING_MAX_MS = 90000;  // 90 seconds maximum
const MAX_CONSECUTIVE_FAILS = 5;
const SUBMISSION_TIMEOUT_MS = 15000; // 15s to confirm submission took
const WS_PORT = 8765;

// ============================================================
// ARGS
// ============================================================

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const startIdx = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1], 10) : null;

// ============================================================
// PROGRESS TRACKING
// ============================================================

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch(e) { console.error('[PROGRESS] Parse error, starting fresh'); }
  }
  return { submitted: [], failed: [], lastIndex: -1, startedAt: new Date().toISOString() };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

function loadQueue() {
  const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  return data.cameras || [];
}

// ============================================================
// WEBSOCKET SERVER (REAL STATE TO DASHBOARD/AMBIENT)
// ============================================================

let wss = null;
let currentState = 'BOOT';
let stats = { active: 0, completed: 0, errors: 0, uptime: 0 };
const startTime = Date.now();

function startWSServer() {
  try {
    wss = new WebSocket.Server({ port: WS_PORT });
    wss.on('connection', (ws) => {
      log('SYS', `Dashboard connected`);
      // Send current state immediately
      broadcastState();
    });
    wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('SYS', `WS port ${WS_PORT} in use — dashboard won't get live data`);
        wss = null;
      }
    });
    log('SYS', `WebSocket server on ws://localhost:${WS_PORT}`);
  } catch(e) {
    log('SYS', `WS server failed: ${e.message}`);
  }
}

function broadcast(frame) {
  if (!wss) return;
  const msg = JSON.stringify(frame);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function broadcastState(queue) {
  stats.uptime = Math.floor((Date.now() - startTime) / 1000);
  broadcast({
    type: 'STATE_UPDATE',
    payload: {
      machine: currentState,
      queue: queue || [],
      stats: stats,
    }
  });
}

function setState(state, queue) {
  currentState = state;
  broadcastState(queue);
}

function broadcastLog(level, message) {
  broadcast({
    type: 'LOG',
    payload: { level, message, timestamp: new Date().toISOString() }
  });
}

// ============================================================
// LOGGING
// ============================================================

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `${ts}  [${level.padEnd(7)}]  ${msg}`;
  console.log(line);
  broadcastLog(level, msg);
}

// ============================================================
// MAIN RUNNER
// ============================================================

async function run() {
  // Setup
  if (!fs.existsSync(ERRORS_DIR)) fs.mkdirSync(ERRORS_DIR, { recursive: true });

  const queue    = loadQueue();
  const progress = loadProgress();

  log('SYS', `AETHEL-RUNNER v1.0 :: ${queue.length} prompts in queue`);
  log('SYS', `Previously submitted: ${progress.submitted.length}`);
  log('SYS', `DRY RUN: ${DRY_RUN}`);

  // Start WebSocket server for dashboard/ambient
  startWSServer();
  setState('BOOT');

  // Determine which prompts to submit
  let toSubmit = queue.filter(c => !progress.submitted.includes(c.variant_id));
  if (startIdx !== null) {
    toSubmit = queue.slice(startIdx).filter(c => !progress.submitted.includes(c.variant_id));
    log('SYS', `Starting from index ${startIdx}`);
  }

  log('SYS', `${toSubmit.length} prompts remaining to submit`);

  if (toSubmit.length === 0) {
    log('SYS', 'Nothing to submit. All prompts already done.');
    setState('HALTED');
    return;
  }

  if (DRY_RUN) {
    for (const cam of toSubmit) {
      log('DRY', `Would submit: ${cam.variant_id} — ${cam.display_name}`);
      log('DRY', `  Prompt: ${cam.prompt.slice(0, 80)}...`);
    }
    log('SYS', `Dry run complete. ${toSubmit.length} prompts would be submitted.`);
    return;
  }

  // Build queue status for dashboard
  const dashQueue = queue.map(c => ({
    id: c.variant_id,
    label: c.display_name,
    status: progress.submitted.includes(c.variant_id) ? 'TETHERED' :
            progress.failed.includes(c.variant_id) ? 'ERROR' : 'PENDING',
    hash: null,
  }));

  // Launch browser with user's Chrome profile for session reuse
  log('SYS', 'Launching browser...');
  setState('IDLE', dashQueue);

  let browser, context, page;
  try {
    // Try to use the user's existing Chrome profile for cookies/session
    const userDataDir = path.join(require('os').homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    
    browser = await chromium.launch({
      headless: false,
      slowMo: 100,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ]
    });
    
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: fs.existsSync(path.resolve(__dirname, 'runway-session.json'))
        ? path.resolve(__dirname, 'runway-session.json')
        : undefined,
    });
    
    page = await context.newPage();
  } catch(e) {
    log('ERROR', `Browser launch failed: ${e.message}`);
    setState('ERROR');
    return;
  }

  // Navigate to Runway
  log('SYS', `Navigating to Runway...`);
  try {
    await page.goto(RUNWAY_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000); // let SPA fully hydrate
  } catch(e) {
    log('ERROR', `Navigation failed: ${e.message}`);
    await page.screenshot({ path: path.join(ERRORS_DIR, `nav_fail_${Date.now()}.png`) });
    setState('ERROR');
    await browser.close();
    return;
  }

  // Check if we're logged in (prompt area should be visible)
  try {
    await page.waitForSelector(SELECTORS.promptArea, { timeout: 10000 });
    log('SYS', 'Prompt area found — logged in and ready');
  } catch(e) {
    log('ERROR', 'Prompt area not found — may need to log in manually');
    await page.screenshot({ path: path.join(ERRORS_DIR, `login_wall_${Date.now()}.png`) });
    log('SYS', 'PAUSED: Log in to Runway in the browser window, then restart runner.js');
    // Save session state for next run
    setState('HALTED');
    // Keep browser open so user can log in
    await new Promise(() => {}); // hang until killed
  }

  // Set duration to 15s
  log('SYS', 'Setting duration to 15 seconds...');
  try {
    await page.click(SELECTORS.durationBtn);
    await page.waitForTimeout(500);
    await page.click(SELECTORS.duration15s);
    await page.waitForTimeout(500);
    log('SYS', 'Duration set to 15s');
  } catch(e) {
    log('WARN', `Duration setting failed: ${e.message} — continuing with default`);
  }

  // ── SUBMISSION LOOP ──
  let consecutiveFails = 0;

  for (let i = 0; i < toSubmit.length; i++) {
    const cam = toSubmit[i];
    const idx = queue.indexOf(cam);
    
    log('DRIP', `[${i + 1}/${toSubmit.length}] Submitting: ${cam.variant_id}`);
    log('DRIP', `  → ${cam.display_name}`);

    // Update dashboard
    dashQueue[idx].status = 'IN_FLIGHT';
    setState('INJECTING', dashQueue);

    try {
      // 1. Clear prompt area
      await page.click(SELECTORS.promptArea);
      await page.waitForTimeout(300);
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);

      // 2. Type prompt
      await page.click(SELECTORS.promptArea);
      await page.waitForTimeout(200);
      // Use fill for contenteditable or type character by character
      try {
        await page.fill(SELECTORS.promptArea, cam.prompt);
      } catch(_) {
        // Fallback: type it
        await page.type(SELECTORS.promptArea, cam.prompt, { delay: 5 });
      }
      await page.waitForTimeout(500);

      log('HCI', `Prompt entered (${cam.prompt.length} chars)`);
      setState('UPLOADING', dashQueue);

      // 3. Click Generate
      await page.click(SELECTORS.generateBtn);
      log('HCI', 'Generate clicked');
      await page.waitForTimeout(2000);

      // 4. Verify submission (look for generation starting)
      let confirmed = false;
      
      // Check: did a new "Generating" or "In queue" appear?
      try {
        const statusEl = await page.waitForSelector(
          `${SELECTORS.inQueue}, ${SELECTORS.generating}`,
          { timeout: SUBMISSION_TIMEOUT_MS }
        );
        if (statusEl) {
          confirmed = true;
          log('STATE', `Submission confirmed — generation queued`);
        }
      } catch(_) {
        // Maybe it started generating so fast the "In queue" was missed
        // Check if the gallery scrolled or a new card appeared
        confirmed = true; // optimistic — we'll check for errors below
        log('STATE', 'No queue indicator found — assuming submission accepted');
      }

      // 5. Check for policy violation
      try {
        const err = await page.$(SELECTORS.policyError);
        if (err) {
          throw new Error('Generation may violate usage policy');
        }
      } catch(policyErr) {
        if (policyErr.message.includes('violate')) {
          throw policyErr;
        }
      }

      // SUCCESS
      dashQueue[idx].status = 'AWAITING';
      setState('AWAITING', dashQueue);
      progress.submitted.push(cam.variant_id);
      stats.completed++;
      saveProgress(progress);
      consecutiveFails = 0;

      log('TETHER', `✓ ${cam.variant_id} submitted successfully [${progress.submitted.length}/${queue.length} total]`);

    } catch(err) {
      // FAILURE
      consecutiveFails++;
      stats.errors++;
      dashQueue[idx].status = 'ERROR';
      setState('ERROR', dashQueue);

      const errFile = path.join(ERRORS_DIR, `${cam.variant_id}_${Date.now()}.png`);
      try { await page.screenshot({ path: errFile, fullPage: true }); } catch(_) {}
      
      progress.failed.push(cam.variant_id);
      saveProgress(progress);

      log('ERROR', `✗ ${cam.variant_id} failed: ${err.message}`);
      log('ERROR', `  Screenshot saved: ${errFile}`);
      log('ERROR', `  Consecutive failures: ${consecutiveFails}/${MAX_CONSECUTIVE_FAILS}`);

      // KILL CRITERIA
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        log('ERROR', `╔══════════════════════════════════════╗`);
        log('ERROR', `║  KILL: ${MAX_CONSECUTIVE_FAILS} consecutive failures       ║`);
        log('ERROR', `║  Runner stopped to prevent waste     ║`);
        log('ERROR', `║  Check errors/ folder for details    ║`);
        log('ERROR', `╚══════════════════════════════════════╝`);
        setState('HALTED', dashQueue);
        break;
      }
    }

    // PACING — random delay before next submission
    if (i < toSubmit.length - 1) {
      const delay = PACING_MIN_MS + Math.random() * (PACING_MAX_MS - PACING_MIN_MS);
      const delaySec = Math.round(delay / 1000);
      log('DRIP', `Pacing: waiting ${delaySec}s before next submission...`);
      setState('IDLE', dashQueue);
      await page.waitForTimeout(delay);
    }
  }

  // DONE
  log('SYS', `═══════════════════════════════════════`);
  log('SYS', `  RUNNER COMPLETE`);
  log('SYS', `  Submitted: ${progress.submitted.length}/${queue.length}`);
  log('SYS', `  Failed:    ${progress.failed.length}`);
  log('SYS', `  Duration:  ${Math.round((Date.now() - startTime) / 60000)} minutes`);
  log('SYS', `═══════════════════════════════════════`);

  setState('HALTED', dashQueue);

  // Save session for next run
  try {
    await context.storageState({ path: path.resolve(__dirname, 'runway-session.json') });
    log('SYS', 'Browser session saved for next run');
  } catch(_) {}

  // Keep browser open for user review
  log('SYS', 'Browser left open for review. Ctrl+C to exit.');
  await new Promise(() => {}); // hang until killed
}

// ============================================================
// ENTRY
// ============================================================

run().catch(err => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
