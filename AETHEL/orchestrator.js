#!/usr/bin/env node
/**
 * ============================================================
 * AETHEL-ORCHESTRATOR v2.0
 * Hopper Logic: High-Latency State Synchronizer
 * Module: Browser-Agent / Drip Scheduler / Tether Daemon
 *
 * USAGE:
 *   npm install
 *   npx playwright install chromium
 *   node orchestrator.js
 *
 * COMPLIANCE NOTE:
 *   This tool automates browser interactions with a remote UI.
 *   Verify the target platform Terms of Service before deployment.
 *   Configure selectors in config.json to match your target DOM.
 * ============================================================
 */

'use strict';

const { chromium }  = require('playwright');
const WebSocket     = require('ws');
const fs            = require('fs');
const path          = require('path');
const crypto        = require('crypto');
const chokidar      = require('chokidar');
const os            = require('os');

// ============================================================
// CONFIGURATION LOADER
// ============================================================

const CONFIG_PATH   = path.resolve('./config.json');
const MANIFEST_PATH = path.resolve('./manifest.json');

const DEFAULTS = {
  targetUrl:        'https://example.com',
  wsPort:           8765,
  downloadDir:      path.join(os.homedir(), 'Downloads'),
  concurrencyLimit: 2,
  pollIntervalMs:   3500,
  pacingMinMs:      900,
  pacingMaxMs:      2400,
  selectors: {
    taskSlot:         '.slot-container',
    availableSlot:    ".slot-container[data-state='idle']",
    promptInput:      'textarea.prompt-field',
    fileInput:        'input[type="file"]',
    submitButton:     'button.generate-btn',
    generationStatus: '[data-generation-status]',
  },
  tethering: {
    watchExtensions:    ['.mp4', '.webm'],
    stabilityThresholdMs: 2000,
    pollIntervalMs:     500,
    namingScheme:       '{hash}_{taskId}{ext}',
  },
  browser: {
    headless:   false,
    slowMo:     0,
    viewport:   { width: 1440, height: 900 },
    userAgent:  null,
  },
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const userCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return deepMerge(DEFAULTS, userCfg);
    } catch (e) {
      console.error(`[CONFIG] Parse error: ${e.message}. Using defaults.`);
    }
  }
  return { ...DEFAULTS };
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

const CFG = loadConfig();

// Resolve ~ in downloadDir
if (CFG.downloadDir.startsWith('~')) {
  CFG.downloadDir = path.join(os.homedir(), CFG.downloadDir.slice(1));
}


// ============================================================
// STATE MACHINE DEFINITION
// ============================================================

const S = Object.freeze({
  BOOT:       'BOOT',
  IDLE:       'IDLE',
  POLLING:    'POLLING',
  SLOT_FOUND: 'SLOT_FOUND',
  UPLOADING:  'UPLOADING',
  INJECTING:  'INJECTING',
  AWAITING:   'AWAITING',
  TETHERING:  'TETHERING',
  ERROR:      'ERROR',
  HALTED:     'HALTED',
});

// Valid state transitions (Hopper graph)
const TRANSITIONS = {
  [S.BOOT]:       [S.IDLE, S.ERROR],
  [S.IDLE]:       [S.POLLING, S.HALTED],
  [S.POLLING]:    [S.IDLE, S.SLOT_FOUND, S.ERROR],
  [S.SLOT_FOUND]: [S.UPLOADING, S.INJECTING, S.ERROR],
  [S.UPLOADING]:  [S.INJECTING, S.ERROR],
  [S.INJECTING]:  [S.AWAITING, S.ERROR],
  [S.AWAITING]:   [S.TETHERING, S.POLLING, S.IDLE],
  [S.TETHERING]:  [S.IDLE, S.ERROR],
  [S.ERROR]:      [S.IDLE, S.HALTED],
  [S.HALTED]:     [],
};


// ============================================================
// APPLICATION STATE
// ============================================================

const appState = {
  machine:        S.BOOT,
  slots:          Array.from({ length: CFG.concurrencyLimit }, (_, i) => ({
                    id: i, status: 'UNKNOWN', taskId: null,
                  })),
  queue:          [],
  stats: {
    active:       0,
    completed:    0,
    errors:       0,
    uptime:       0,
  },
  sessionStart:   Date.now(),
};


// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocket.Server({ port: CFG.wsPort });

wss.on('listening', () => {
  rawLog('SYS', `WebSocket daemon: ws://localhost:${CFG.wsPort}`);
});

wss.on('error', err => {
  rawLog('ERROR', `WebSocket server error: ${err.message}`);
});

function broadcast(type, payload) {
  const frame = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(frame); } catch (_) {}
    }
  });
}

function broadcastState() {
  broadcast('STATE_UPDATE', {
    machine:  appState.machine,
    slots:    appState.slots,
    queue:    appState.queue.map(t => ({
                id:     t.id,
                label:  t.label || t.id,
                status: t.status,
                hash:   t.promptHash || null,
              })),
    stats:    {
      ...appState.stats,
      uptime: Math.floor((Date.now() - appState.sessionStart) / 1000),
    },
  });
}


// ============================================================
// LOGGER
// ============================================================

const LOG_BUFFER  = [];
const LOG_MAX     = 600;

function rawLog(level, message) {
  const ts    = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  const entry = { ts, level: level.toUpperCase(), message };
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > LOG_MAX) LOG_BUFFER.shift();
  process.stdout.write(`[${ts}] [${entry.level.padEnd(8)}] ${message}\n`);
  broadcast('LOG', entry);
}

function log(level, message) { rawLog(level, message); }


// ============================================================
// STATE MACHINE: TRANSITION GUARD
// ============================================================

function setState(next) {
  const valid = TRANSITIONS[appState.machine] || [];
  if (!valid.includes(next)) {
    rawLog('WARN', `Blocked transition: ${appState.machine} >> ${next} (not in graph)`);
    return false;
  }
  const prev = appState.machine;
  appState.machine = next;
  rawLog('STATE', `${prev} >> ${next}`);
  broadcastState();
  return true;
}

function forceState(next) {
  const prev = appState.machine;
  appState.machine = next;
  if (prev !== next) {
    rawLog('STATE', `FORCE: ${prev} >> ${next}`);
    broadcastState();
  }
}


// ============================================================
// MANIFEST OPERATIONS
// ============================================================

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    rawLog('WARN', 'manifest.json not found. Queue empty.');
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(raw.tasks) ? raw.tasks : [];
  } catch (e) {
    rawLog('ERROR', `Manifest parse failure: ${e.message}`);
    return [];
  }
}

function saveManifest(tasks) {
  let existing = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch (_) {}
  }
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ ...existing, tasks }, null, 2),
    'utf8',
  );
}


// ============================================================
// PACING: VARIABLE-SPEED INTERVALS
// ============================================================

function pace(minMs, maxMs) {
  minMs = minMs ?? CFG.pacingMinMs;
  maxMs = maxMs ?? CFG.pacingMaxMs;
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, delay));
}

function poll(ms) {
  ms = ms ?? CFG.pollIntervalMs;
  return new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 500)));
}


// ============================================================
// TETHERING: PROMPT HASH GENERATION
// ============================================================

function hashPrompt(prompt) {
  return crypto
    .createHash('sha256')
    .update(prompt.trim())
    .digest('hex')
    .slice(0, 12);
}

function buildOutputFilename(task, originalExt) {
  const scheme = CFG.tethering.namingScheme || '{hash}_{taskId}{ext}';
  return scheme
    .replace('{hash}',   task.promptHash || hashPrompt(task.prompt))
    .replace('{taskId}', task.id)
    .replace('{ext}',    originalExt);
}


// ============================================================
// FILE-WATCHER: TETHER DAEMON
// ============================================================

function startTetherDaemon() {
  const watchExts = CFG.tethering.watchExtensions || ['.mp4', '.webm'];
  const watchDir  = CFG.downloadDir;

  rawLog('TETHER', `Daemon armed. Watching: ${watchDir}`);
  rawLog('TETHER', `Extensions: ${watchExts.join(', ')}`);

  const watcher = chokidar.watch(watchDir, {
    ignoreInitial:    true,
    depth:            0,
    awaitWriteFinish: {
      stabilityThreshold: CFG.tethering.stabilityThresholdMs,
      pollInterval:       CFG.tethering.pollIntervalMs,
    },
  });

  watcher.on('add', async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!watchExts.includes(ext)) return;

    rawLog('TETHER', `File detected: ${path.basename(filePath)}`);

    const manifest = loadManifest();
    const task = manifest.find(t => t.status === 'AWAITING');

    if (!task) {
      rawLog('TETHER', `No AWAITING task. File not bound: ${path.basename(filePath)}`);
      return;
    }

    setState(S.TETHERING);

    const newName = buildOutputFilename(task, ext);
    const newPath = path.join(watchDir, newName);

    try {
      fs.renameSync(filePath, newPath);

      task.status     = 'TETHERED';
      task.outputFile = newName;
      task.tetherTs   = new Date().toISOString();
      saveManifest(manifest);

      appState.stats.completed++;
      appState.stats.active = Math.max(0, appState.stats.active - 1);

      rawLog('TETHER', `BOUND: "${path.basename(filePath)}" >> "${newName}" [task: ${task.id}]`);
      broadcastState();
      forceState(S.IDLE);

    } catch (e) {
      rawLog('ERROR', `Tether rename failed: ${e.message}`);
      task.status   = 'TETHER_ERROR';
      task.errorMsg = e.message;
      saveManifest(manifest);
      appState.stats.errors++;
      forceState(S.ERROR);
    }
  });

  watcher.on('error', err => {
    rawLog('ERROR', `Tether watcher error: ${err.message}`);
  });

  return watcher;
}


// ============================================================
// HCI SIMULATION: PLAYWRIGHT ACTIONS
// ============================================================

/**
 * Poll the remote UI for available task slots.
 * Returns the count of slots currently in an idle or available state.
 * ADAPT: Modify CFG.selectors.availableSlot in config.json.
 */
async function countAvailableSlots(page) {
  try {
    const nodes = await page.$$(CFG.selectors.availableSlot);
    return nodes.length;
  } catch (e) {
    rawLog('WARN', `Slot poll error: ${e.message}`);
    return 0;
  }
}

/**
 * Upload a local reference asset to the remote file input buffer.
 * Simulates human-paced interaction to avoid event-loop overflow.
 */
async function uploadAsset(page, task) {
  const assetPath = task.assetPath;
  rawLog('HCI', `Asset upload: ${path.basename(assetPath)}`);

  const fileInput = await page.$(CFG.selectors.fileInput);
  if (!fileInput) throw new Error('File input element not found in DOM');

  if (!fs.existsSync(assetPath)) {
    rawLog('WARN', `Asset file not found, skipping: ${assetPath}`);
    return;
  }

  await fileInput.setInputFiles(assetPath);
  await pace(1200, 2800);

  rawLog('HCI', `Asset buffered: ${path.basename(assetPath)}`);
  broadcast('UPLOAD_PROGRESS', { taskId: task.id, progress: 100, file: path.basename(assetPath) });
}

/**
 * Inject an ekphrastic prompt string into the remote text field.
 * Supports timeline-annotated format: "[0s-5s] @Ref_A description..."
 * Uses chunked typing with randomized delay to prevent input overflow.
 */
async function injectPrompt(page, task) {
  const { prompt } = task;
  rawLog('HCI', `Prompt injection: ${prompt.length} chars`);

  const field = await page.$(CFG.selectors.promptInput);
  if (!field) throw new Error('Prompt input field not found in DOM');

  await field.click();
  await pace(300, 700);

  // Clear existing content
  await page.keyboard.press('Control+a');
  await pace(100, 200);
  await page.keyboard.press('Delete');
  await pace(200, 400);

  // Chunk-typed input: simulates natural typing cadence
  const CHUNK_SIZE = 35;
  const chunks     = [];
  for (let i = 0; i < prompt.length; i += CHUNK_SIZE) {
    chunks.push(prompt.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    await field.type(chunk, { delay: Math.floor(Math.random() * 45) + 15 });
    // Brief micro-pause between chunks: prevents remote event-loop saturation
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await pace(80, 220);
    }
  }

  await pace(500, 1000);
  rawLog('HCI', 'Prompt injection complete');
}

/**
 * Submit the current task configuration to the remote UI.
 */
async function submitTask(page, task) {
  rawLog('HCI', `Submitting: ${task.id}`);
  const btn = await page.$(CFG.selectors.submitButton);
  if (!btn) throw new Error('Submit button not found in DOM');

  await btn.scrollIntoViewIfNeeded();
  await pace(300, 600);
  await btn.click();
  await pace(CFG.pacingMinMs, CFG.pacingMaxMs);

  rawLog('HCI', `Submit dispatched: ${task.id}`);
}


// ============================================================
// DRIP SCHEDULER: MAIN ORCHESTRATION LOOP
// ============================================================

async function dripScheduler(page) {
  rawLog('DRIP', 'Drip scheduler online');
  forceState(S.IDLE);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (appState.machine === S.HALTED) break;

    // Load fresh manifest on each cycle
    const manifest     = loadManifest();
    const pendingTasks = manifest.filter(t => t.status === 'PENDING');
    const activeTasks  = manifest.filter(t => t.status === 'IN_FLIGHT' || t.status === 'AWAITING');
    const allDone      = manifest.every(t =>
      ['TETHERED', 'ERROR', 'TETHER_ERROR'].includes(t.status),
    );

    // Expose queue to WS clients
    appState.queue          = pendingTasks;
    appState.stats.active   = activeTasks.length;
    broadcastState();

    // Halt condition
    if (allDone && manifest.length > 0) {
      rawLog('SYS', `All ${manifest.length} tasks resolved. Halting orchestrator.`);
      forceState(S.HALTED);
      break;
    }

    // Poll remote UI for slot availability
    setState(S.POLLING) || forceState(S.POLLING);
    await poll();

    let availableSlots;
    try {
      availableSlots = await countAvailableSlots(page);
    } catch (e) {
      rawLog('ERROR', `Slot count failed: ${e.message}`);
      forceState(S.ERROR);
      await pace(4000, 7000);
      forceState(S.IDLE);
      continue;
    }

    // Update slot display
    for (let i = 0; i < CFG.concurrencyLimit; i++) {
      const occupied = i >= availableSlots;
      const matchingTask = activeTasks[i] || null;
      appState.slots[i] = {
        id:     i,
        status: occupied ? 'OCCUPIED' : 'AVAILABLE',
        taskId: occupied && matchingTask ? matchingTask.id : null,
      };
    }
    broadcastState();

    rawLog('DRIP', `Slot poll: ${availableSlots} available / ${CFG.concurrencyLimit} total`);

    // Concurrency ceiling check
    if (availableSlots < 1) {
      rawLog('DRIP', `Ceiling: ${CFG.concurrencyLimit}/${CFG.concurrencyLimit} occupied. Holding.`);
      forceState(S.IDLE);
      continue;
    }

    // No pending tasks
    if (pendingTasks.length === 0) {
      rawLog('DRIP', 'No PENDING tasks. Waiting for queue or tether events.');
      forceState(S.IDLE);
      continue;
    }

    // DISPATCH: Release next task from queue
    const task = pendingTasks[0];
    setState(S.SLOT_FOUND) || forceState(S.SLOT_FOUND);
    rawLog('DRIP', `Dispatching task: ${task.id} (${task.label || 'unlabeled'})`);

    try {
      // Mark in-flight
      task.status      = 'IN_FLIGHT';
      task.startTs     = new Date().toISOString();
      task.promptHash  = hashPrompt(task.prompt);
      saveManifest(manifest);

      // Step 1: Upload reference asset
      if (task.assetPath) {
        setState(S.UPLOADING) || forceState(S.UPLOADING);
        await uploadAsset(page, task);
      }

      // Step 2: Inject ekphrastic prompt
      setState(S.INJECTING) || forceState(S.INJECTING);
      await injectPrompt(page, task);
      await pace(600, 1200);

      // Step 3: Submit to remote UI
      await submitTask(page, task);

      // Step 4: Await remote generation + file arrival
      task.status = 'AWAITING';
      saveManifest(manifest);
      setState(S.AWAITING) || forceState(S.AWAITING);

      rawLog('DRIP', `Task ${task.id} is AWAITING remote generation. Hash: ${task.promptHash}`);

    } catch (err) {
      rawLog('ERROR', `Task ${task.id} dispatch failure: ${err.message}`);
      task.status   = 'ERROR';
      task.errorMsg = err.message;
      task.errorTs  = new Date().toISOString();
      saveManifest(manifest);

      appState.stats.errors++;
      forceState(S.ERROR);
      await pace(4000, 8000);
      forceState(S.IDLE);
    }
  }

  rawLog('SYS', 'Drip scheduler terminated.');
}


// ============================================================
// UPTIME TICKER
// ============================================================

setInterval(() => {
  appState.stats.uptime = Math.floor((Date.now() - appState.sessionStart) / 1000);
  broadcastState();
}, 5000);


// ============================================================
// ENTRY POINT
// ============================================================

async function main() {
  rawLog('SYS', '='.repeat(56));
  rawLog('SYS', 'AETHEL-ORCHESTRATOR v2.0 :: BOOT SEQUENCE INITIATED');
  rawLog('SYS', '='.repeat(56));
  rawLog('SYS', `Target URL:           ${CFG.targetUrl}`);
  rawLog('SYS', `Concurrency ceiling:  ${CFG.concurrencyLimit}`);
  rawLog('SYS', `Poll interval:        ${CFG.pollIntervalMs}ms`);
  rawLog('SYS', `Pacing range:         ${CFG.pacingMinMs}ms - ${CFG.pacingMaxMs}ms`);
  rawLog('SYS', `Download watch dir:   ${CFG.downloadDir}`);
  rawLog('SYS', `WebSocket port:       ${CFG.wsPort}`);
  rawLog('SYS', '='.repeat(56));

  forceState(S.BOOT);

  // Start tether daemon
  startTetherDaemon();

  // Launch Playwright browser
  rawLog('SYS', 'Launching browser session...');
  const browser = await chromium.launch({
    headless: CFG.browser.headless,
    slowMo:   CFG.browser.slowMo,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport:        CFG.browser.viewport,
    userAgent:       CFG.browser.userAgent || undefined,
  });

  const page = await context.newPage();

  // Handle page crashes
  page.on('crash', () => {
    rawLog('FATAL', 'Page crashed. Terminating session.');
    process.exit(1);
  });

  // Navigate to target
  rawLog('SYS', `Navigating to target: ${CFG.targetUrl}`);
  try {
    await page.goto(CFG.targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    rawLog('WARN', `Navigation timeout or error: ${e.message}`);
    rawLog('WARN', 'Continuing. Platform may require manual interaction.');
  }

  rawLog('SYS', 'Browser session established.');
  rawLog('SYS', 'If authentication is required: complete login in the browser window.');
  rawLog('SYS', 'Resuming in 6 seconds...');
  await pace(6000, 6000);

  // Begin drip orchestration
  await dripScheduler(page);

  await browser.close();
  rawLog('SYS', 'Browser session closed. All operations complete.');
  process.exit(0);
}

// Handle unhandled rejections gracefully
process.on('unhandledRejection', (reason) => {
  rawLog('FATAL', `Unhandled rejection: ${reason}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  rawLog('SYS', 'SIGINT received. Shutting down.');
  process.exit(0);
});

main();
