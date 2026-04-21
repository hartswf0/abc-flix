# AETHEL-ORCHESTRATOR v2.0
## WorldText Engine :: Shield of Achilles Benchmark Suite
### Hopper Logic: High-Latency State Synchronizer

---

## OVERVIEW

A single-session browser-agent that orchestrates generative media workflows
against a remote web UI. Maintains a strict concurrency ceiling of 2 task slots,
drips tasks from a local manifest.json, and tethers output files to their
originating ekphrastic specifications via a prompt hash.

---

## ARCHITECTURE

```
manifest.json
    |
    v
orchestrator.js  (Node.js + Playwright)
    |   |
    |   +-- WebSocket server :8765 -----> dashboard.html (browser)
    |
    +-- Browser Session (Playwright Chromium)
    |       |
    |       +-- Poll for available slots in remote UI
    |       +-- Upload reference assets via file input
    |       +-- Inject timeline prompts via text field
    |       +-- Submit task to remote generation queue
    |
    +-- Tether Daemon (chokidar file watcher)
            |
            +-- Watch ~/Downloads for .mp4 / .webm arrivals
            +-- Cross-reference AWAITING task in manifest
            +-- Rename file: {sha256_hash}_{taskId}.mp4
            +-- Mark task TETHERED in manifest
```

---

## INSTALLATION

```bash
npm install
npx playwright install chromium
```

---

## CONFIGURATION

Edit config.json before first run.

Required settings:
- targetUrl:    URL of the remote generative UI
- downloadDir:  Path to the browser download directory
- selectors:    CSS selectors matching the target UI DOM

SELECTOR ADAPTATION:
Inspect the target web UI and update selectors to match:
  - availableSlot:  element indicating an idle/available generation slot
  - promptInput:    textarea for ekphrastic prompt entry
  - fileInput:      file input for reference asset upload
  - submitButton:   button that initiates generation

COMPLIANCE NOTE:
Verify the target platform Terms of Service permits automated
browser interaction before deployment.

---

## MANIFEST FORMAT

manifest.json contains an array of task objects:

```json
{
  "tasks": [
    {
      "id":        "AEL-001",
      "label":     "Harbor fog at dawn",
      "prompt":    "[0s-3s] Wide establishing shot, harbor, dense morning fog...",
      "assetPath": "./assets/ref_harbor_A.jpg",
      "status":    "PENDING"
    }
  ]
}
```

Status lifecycle:
  PENDING >> IN_FLIGHT >> AWAITING >> TETHERED
                                 |
                                 +>> ERROR

Prompt format:
  Plain text or timeline-annotated:
  "[0s-5s] @Ref_A wide shot description. [5s-10s] Camera movement description."

---

## USAGE

1. Configure config.json (targetUrl, selectors, downloadDir)
2. Populate manifest.json with your tasks
3. Run the orchestrator:

```bash
node orchestrator.js
```

4. Open dashboard.html in a browser:

```bash
open dashboard.html
```

5. If the target platform requires authentication, complete login
   in the Playwright browser window. The orchestrator pauses 6
   seconds on first launch for this purpose.

---

## DASHBOARD

Open dashboard.html in any browser. Connects to the WebSocket
server on ws://localhost:8765. Displays:

- State machine current state
- Slot availability (Available / Occupied)
- Task queue mirror with status badges
- System terminal with filterable log stream
- Stats: active, completed, errors, uptime

DEMO MODE activates automatically when the orchestrator is offline.

---

## TETHERING LOGIC

When a .mp4 or .webm file arrives in the download directory:
1. The tether daemon identifies the oldest AWAITING task
2. Computes SHA-256 of the task prompt (first 12 chars)
3. Renames the file: {hash}_{taskId}.mp4
4. Updates manifest.json: status TETHERED, outputFile, tetherTs

This creates a durable link between the ekphrastic specification
and the generated output for downstream WorldText dataset assembly.

---

## STATE MACHINE (HOPPER GRAPH)

BOOT >> IDLE >> POLLING >> SLOT_FOUND >> UPLOADING >> INJECTING >> AWAITING >> TETHERING >> IDLE
                |                                                  |
                +<-------------------------------------------------+
                |
                v
              HALTED (all tasks resolved)

---

## LINGUISTIC CONSTRAINTS (per spec)

The word "merely" and the em dash character are prohibited in all
UI text, console output, and documentation per project specification.

---

## DEPENDENCIES

- playwright:  ^1.44.0  (browser automation)
- ws:          ^8.17.0  (WebSocket server)
- chokidar:    ^3.6.0   (file system watcher)

Node.js >= 18.0.0 required.

---

*Augmented Environments Lab :: Georgia Tech :: AEL-AETHEL-2.0*
