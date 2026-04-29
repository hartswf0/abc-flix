# ICARO HARNESS — Theory of the Program

> I will first construct the `<theory-of-the-program>`, then generate `<program text>` only after the theory is explicit.

---

## 1. `<Initial Interpretation>`

### The Task as a Program Theory Problem

The ICARO Harness is not a single application. It is a **coupling instrument** that binds two independent representation engines into a single coherent production surface:

- **Engine** (`icaro-pro-bus.html`): A 2D frame-by-frame animation workbench operating in a 128×96 grid with an 8-shade BEFLIX palette. The atomic unit is the `<frame>` — a pixel grid + optional ink layers.
- **Tunnel** (`c-bus.html`): A 3D cylindrical timeline that renders the same `<frame>` sequence as textured faces on a barrel/tunnel geometry. The atomic unit is the `<clip>` — a positioned segment in tunnel-space.
- **Harness** (`harness.html`): The message bus that enforces **same-worldness** — the invariant that both instruments always agree on which `<frame>` is current.

### The Real-World Activity

A filmmaker is working on a BEFLIX-style animation. They need to simultaneously:
1. **Edit** individual frames (draw, stamp text, run scripts) in the engine
2. **Navigate** the temporal structure (scrub, fly through) in the tunnel
3. **See** the effect of navigation in one instrument reflected instantly in the other

The program describes **bidirectional temporal navigation across two incompatible coordinate systems**.

---

## 2. `<Theory Skeleton>`

### `<Entities>`

| Entity | Type | Location | Description |
|--------|------|----------|-------------|
| `<frame>` | Data | Engine | A 640×480 composite of `{src, scriptLayer, handLayer}` rendered through dot stamps |
| `<grid>` | Data | Bus | A 128×96 array of shade values (0-7), the canonical transport format |
| `<clip>` | Object | Tunnel | A positioned segment in tunnel-space: `{start, dur, track, _frameIndex}` |
| `<cursor>` | State | Engine | Integer index into `state.frames[]` — the currently active frame |
| `<camera>` | State | Tunnel | Float position `S.cam` in tunnel z-space |
| `<ink>` | Data | Engine | 8-level shade palette `{id: 0-7, hex, rgb}` |
| `<track>` | Enum | Tunnel | One of 4 probability lanes: POSSIBLE, PLAUSIBLE, PROBABLE, PREFERRED |
| `<view>` | Enum | Tunnel | Camera perspective: BARREL, INSIDE, OUTSIDE, SIDE, BENCH |
| `<tool>` | Enum | Both | Active manipulation mode (PEN, BOX, ERASE in engine; MOVE, TRIM, ROLL, LIFT, SPLIT, ROUTE, STORE in tunnel) |
| `<bus-message>` | Event | Harness | A typed postMessage payload routed between instruments |
| `<harness>` | Container | Parent | The iframe host that owns the message bus |
| `<undo-stack>` | Data | Engine | Snapshot-based undo for handLayer mutations (max 30 entries) |
| `<clip-sovereignty>` | Invariant | Tunnel | Clip state (dur, track, lift, rot) is user-owned and survives bus sync |

### `[Operations]`

| Operation | Actor | Effect |
|-----------|-------|--------|
| `[draw]` | Engine | Mutates `<frame>.handLayer` at cursor position |
| `[stamp-text]` | Engine | Burns text into `<frame>.scriptLayer` across a range |
| `[ingest-video]` | Engine | Rips video into a batch of `<frame>` objects |
| `[navigate-cursor]` | Engine | Changes `<cursor>`, triggers `[emit-cursor-move]` |
| `[scrub-camera]` | Tunnel | Changes `<camera>`, triggers `[emit-goto-frame]` |
| `[select-clip]` | Tunnel | Sets `S.selected`, triggers `[emit-goto-frame]` + `[emit-clip-select]` |
| `[emit-cursor-move]` | Engine→Bus | Sends `CURSOR_MOVE{cursor, total}` to parent |
| `[emit-goto-frame]` | Tunnel→Bus | Sends `GOTO_FRAME{cursor, source}` to parent |
| `[emit-frames-sync]` | Engine→Bus | Sends full `FRAMES_SYNC` — BOOT + RECOVERY ONLY (LAW 6) |
| `[emit-delta]` | Engine→Bus | Sends `FRAME_PATCH{index, grid, version}` on pixel mutation |
| `[live-draw-sync]` | Engine | 100ms debounced `FRAME_PATCH` during active brush strokes |
| `[highlight-frame]` | Engine | O(1) cursor change — moves `.on` class, zero DOM creation |
| `[update-thumb]` | Engine | O(1) pixel mutation — refreshes single thumbnail + emits delta |
| `[cull-textures]` | Tunnel | Releases textures for clips outside `<frustum>` (LAW 7) |
| `[hydrate-frustum]` | Tunnel | Pre-loads textures for clips entering camera view |
| `[route-message]` | Harness | Receives from one iframe, forwards to the other |
| `[pool-message]` | Harness | rAF deduplication — forwards only latest cursor/goto per frame |
| `[derive-frame-from-camera]` | Tunnel | `Math.round(S.cam / (SNAP * 2))` → frame index |
| `[derive-camera-from-cursor]` | Tunnel | `cursor * SNAP * 2` → camera position |
| `[push-undo]` | Engine | Snapshots handLayer before drawing begins |
| `[undo]` | Engine | Restores handLayer from snapshot, increments `_v`, emits FRAME_PATCH |
| `[sync-clips-incremental]` | Tunnel | Reconciles clip array with new frame count without destroying user edits |

### `<States>`

```
<engine-state> := {
    frames: [<frame>],
    cur: <cursor>,
    playing: bool,
    tool: <tool>,
    color: int(0-7),
    size: int(1-24)
}

<tunnel-state> := {
    clips: [<clip>],
    cam: float,          // z-position in tunnel
    zoom: float,
    roll: float,
    view: int(0-4),
    tool: <tool>,
    selected: <clip>?,
    play: bool,
    inertia: float
}

<harness-state> := {
    engineReady: bool,
    tunnelReady: bool,
    framesSynced: int,
    mobileMode: int(0-2)  // split, max-engine, max-tunnel
}
```

### `<Constraints>`

1. **Frame Integrity**: `<frame>.src` is a canvas element. Layers are nullable `Uint8ClampedArray` (lazy allocation).
2. **Grid Transport**: Frame data crosses the iframe boundary as `Uint8Array(128x96)` of shade values, not raw pixels.
3. **Iframe Isolation**: Engine and tunnel share NO JavaScript state. All coupling is via `postMessage`.
4. **Height Explicitness**: Iframes require explicit `height` values (not `auto`, not flex). `calc(50dvh - 14px)` is the canonical mobile formula.

### `<Invariants>`

> [!IMPORTANT]
> These are the laws the system must never violate.

| ID | Invariant | Enforced By |
|----|-----------|-------------|
| **I-1** | `cursor(engine) == frameIndex(tunnel.camera)` at rest | Bidirectional message sync |
| **I-2** | `frames.length == clips.length` after `FRAMES_SYNC` | `_busSeedFromFrames()` |
| **I-3** | No feedback loops: `GOTO_FRAME` must not trigger `CURSOR_MOVE` which triggers `GOTO_FRAME` | `_busInboundGoto` guard + `_busCamLastFrame` tracking |
| **I-4** | Frame thumbnails on tunnel clip faces match engine frame content | Versioned cache: `_busFrameCache.get(i).version === frame._v` |
| **I-5** | Both instruments are visible simultaneously on mobile (default split mode) | `height: calc(50dvh - 14px)` on both iframes |

---

## 3. `<Assumption Ledger>`

| # | Assumption | Status |
|---|-----------|--------|
| A-1 | `postMessage` between same-origin iframes is synchronous enough for 60fps scrubbing | `<safe>` — same-origin, no serialization delay |
| A-2 | `100dvh` is supported in the target browser | `<safe>` — all modern mobile browsers since 2023 |
| A-3 | Iframe `innerHeight` reflects the explicit CSS height set by the parent | `<safe>` — standard behavior |
| A-4 | `position: fixed` inside an iframe is relative to the iframe viewport, not the parent | `<safe>` — spec behavior, but was previously broken by using `100vh` instead of `100%` |
| A-5 | The tunnel camera position `S.cam` maps linearly to frame indices via `Math.round(S.cam / (SNAP * 2))` | `<uncertain>` — assumes clips are uniformly spaced at `SNAP * 2` intervals |
| A-6 | FRAMES_SYNC transfers all grids at once | `<superseded>` — LAW 6 limits this to boot/recovery. Normal ops use FRAME_PATCH |
| A-7 | Mobile browser will not reclaim iframe memory when the tab is backgrounded | `<requires-user-decision>` — depends on device memory pressure |
| A-8 | The 60ms throttle on camera-to-frame sync is fast enough for fluid coupling | `<uncertain>` — may need reduction to 30ms for high-FPS devices |
| A-9 | `file://` protocol supports cross-iframe `postMessage` | `<unsafe>` — browsers treat each `file://` URL as a unique origin. `postMessage('*')` works but origin validation is impossible. Must serve from HTTP for production. |

---

## 4. `<Operational Description>`

### The Coupling Cycle (Tunnel drives Engine)

```
<user> [scrubs tunnel camera]
    |
<tunnel.S.cam> [changes to] <new-z-position>
    |
<tunnel.render-loop> [derives] <frame-index> := Math.round(S.cam / (SNAP * 2))
    |
<frame-index> [differs from] <_busCamLastFrame>
    | (60ms throttle)
<tunnel> [emits] GOTO_FRAME{cursor: frame-index, source: 'camera'}
    |
<harness> [routes] message to engine iframe
    |
<engine> [receives] GOTO_FRAME
    |
<engine._busInboundGoto> [set to] true  // feedback guard ON
    |
<engine.state.cur> [set to] frame-index
    |
<engine.renderOutput()> [renders] new frame on canvas
    |
<engine._atoBusEmitCursor()> [BLOCKED by] _busInboundGoto === true  // NO echo
    |
<engine.timeline-strip> [scrolls to] active frame thumbnail
    |
<engine._busInboundGoto> [set to] false  // guard released
```

### The Reverse Cycle (Engine drives Tunnel)

```
<user> [clicks frame thumbnail in engine timeline]
    |
<engine.state.cur> [changes to] <clicked-index>
    |
<engine.renderOutput()> [renders] new frame + [emits] CURSOR_MOVE{cursor}
    |
<harness> [routes] message to tunnel iframe
    |
<tunnel> [receives] CURSOR_MOVE{cursor}
    |
<tunnel.S.cam> [set to] cursor * SNAP * 2
    |
<tunnel._busCamLastFrame> [set to] cursor  // prevents echo
    |
<tunnel.render-loop> [renders] new camera position
    |
<tunnel.render-loop> [checks] frameIdx === _busCamLastFrame --> NO emit
```

### The Full Sync Cycle (Video Ingestion)

```
<user> [loads video into engine]
    |
<engine.ingestMedia()> [rips] video into N frames
    |
<engine.rebuildTrack()> [monkey-patched] --> _atoBusEmitSync()
    |
<engine> [emits] FRAMES_SYNC{frames: [{index, grid, version}], total, cursor, gridW, gridH}
    |
<harness> [routes] to tunnel
    |
<tunnel> [processes] thumbnails in async batches (8 per tick)
    |
<tunnel._busSeedFromFrames()> [creates] 1 clip per frame, distributed across 4 tracks
    |
<tunnel> [renders] frame thumbnails as textures on clip faces
```

---

## 5. `<Failure Description>`

| Failure Mode | Cause | System Response |
|---|---|---|
| **Feedback Loop** | `GOTO_FRAME` triggers `CURSOR_MOVE` triggers camera move triggers `GOTO_FRAME` | `_busInboundGoto` guard blocks the echo at the engine; `_busCamLastFrame` prevents re-emission at the tunnel |
| **Thumbnail Stale** | Engine frame modified but tunnel still shows old texture | Live drawing sync: 100ms debounced `FRAME_PATCH` during brush strokes + `_gridCache` invalidation on mutation |
| **Null Clip Crash** | `hit()` returns `{mode: 'lathe', clip: null}` when clicking playhead | Null guard in pointerdown: falls through to scrub mode if `h.clip` is null |
| **file:// Origin** | Browsers treat each `file://` URL as unique security origin | `postMessage('*')` still works but logs warnings. Serve from `localhost` for clean operation |
| **Iframe Height Collapse** | CSS `height: auto` on iframe defaults to 150px | Explicit `calc(50dvh - 14px)` with `!important` override |
| **100vh Inside Iframe** | `100vh` in iframe CSS refers to parent viewport on some mobile browsers | Changed to `100%` (relative to iframe containing block) |
| **GPU OOM** | 500+ uncompressed textures crash mobile browser | LAW 7: Frustum culling with texture pool (max 32 active canvases) |
| **Bus Stale Detection** | Engine or tunnel stops responding | Harness heartbeat (3s interval) checks `lastEngineMsg`/`lastTunnelMsg`, shows STALE after 10s/15s |
| **Event Flooding** | User scrubbing emits 120+ messages/sec | rAF pooling in harness deduplicates to 1 message/render-frame |
| **Tab Background** | Browser suspends iframe execution | `visibilitychange` listener triggers `REQUEST_SYNC` on return |

---

## 6. `<Change Test>`

### Scenario 1: Non-Uniform Clip Duration

> "What if clips have variable durations instead of uniform `SNAP * 2`?"

**Impact**: The linear formula `Math.round(S.cam / (SNAP * 2))` breaks. You need a binary search over accumulated clip durations to find which frame the camera is over.

**Changes Required**:
- `[derive-frame-from-camera]` becomes `O(log n)` binary search instead of `O(1)` division
- `[derive-camera-from-cursor]` becomes prefix-sum lookup instead of multiplication
- `_busSeedFromFrames()` must accept variable durations from the engine
- `FRAMES_SYNC` payload must include per-frame duration metadata

### Scenario 2: Multi-User Collaborative Editing

> "What if two users are editing the same sequence simultaneously?"

**Impact**: The invariant **I-1** (cursor agreement) becomes a distributed consensus problem. Two cursors may be on different frames.

**Changes Required**:
- `<cursor>` becomes `<cursor-set>` — one per user
- `CURSOR_MOVE` must include `{userId, cursor}`
- Tunnel renders multiple camera indicators
- Engine shows multiple cursor highlights in timeline strip
- `FRAMES_SYNC` needs conflict resolution (OT or CRDT for layer edits)
- Harness becomes a relay server instead of a local iframe router

### Scenario 3: Audio Track Binding

> "What if frames are synced to an audio waveform?"

**Impact**: The `<cursor>` is no longer just a frame index — it is a position in **audio time**. The coupling formula changes from frame-index arithmetic to time-based interpolation.

**Changes Required**:
- New entity: `<audio-source>` with `{blob, duration, sampleRate}`
- `[derive-frame-from-time]`: `Math.floor(audioTime * fps)`
- `[derive-camera-from-time]`: `audioTime * SNAP * 2 * fps`
- Engine playback must use `AudioContext.currentTime` as master clock
- Tunnel camera driven by audio position, not its own inertia

---

## 7. `<Implementation Plan>` (As-Built)

```
harness.html
+-- CSS: Mobile split layout (50dvh/50dvh with bus strip)
+-- CSS: 3-mode toggle (split -> max-engine -> max-tunnel)
+-- JS: Message router (engine->tunnel, tunnel->engine)
+-- JS: Bus activity animation (dot pulse, sync bar)
+-- JS: Heartbeat monitor (stale detection)
+-- JS: Divider resize (desktop only)

icaro-pro-bus.html
+-- BEFLIX engine (128x96 grid, 8-shade palette)
+-- Frame management (inject, duplicate, delete, reorder)
+-- Drawing tools (pen, box, erase + brush size)
+-- Text stamper (BEFLIX dot-matrix font)
+-- Script executor (CLR, PNT, LIN, REC, SHF commands)
+-- Video ingestion (realtime rAF capture)
+-- Timeline strip (horizontal scroll, drag reorder)
+-- Tab/sheet UI (ADD, BUILD, COLOR, SAVE)
+-- ATO-BUS Emitter Shim
    +-- _atoBusEmitSync() — full frame grid broadcast
    +-- _atoBusEmitCursor() — cursor position broadcast
    +-- _atoBusEmitPlay() — play state broadcast
    +-- _busInboundGoto guard — feedback loop prevention
    +-- GOTO_FRAME handler — with timeline auto-scroll

c-bus.html
+-- 3D tunnel renderer (barrel/inside/outside/side/bench views)
+-- Clip management (create, trim, roll, lift, split, route, store)
+-- 4-track system (POSSIBLE/PLAUSIBLE/PROBABLE/PREFERRED)
+-- Camera physics (inertia, magnetic snap, zoom)
+-- Touch/pointer input (scrub, drag, pinch)
+-- ATO-BUS Receiver Shim
    +-- _busRenderThumb() — grid to canvas thumbnail
    +-- _busSeedFromFrames() — auto-generate clips from frame data
    +-- hatch() patch — draws thumbnails on clip faces
    +-- Continuous camera->frame sync (render loop, 60ms throttle)
    +-- _busCamLastFrame echo prevention
    +-- Loading overlay (reel animation during rip)
```

---

## 8. `<Theory-Code Mapping>`

| Theory Element | Code Artifact | Location |
|---|---|---|
| `<frame>` entity | `state.frames[]` objects | [icaro-pro-bus.html:656](file:///Users/gaia/ABC%20FLIX/icaro-pro-bus.html#L656) |
| `<grid>` transport format | `_atoBusExtractGrid()` | [icaro-pro-bus.html:2726](file:///Users/gaia/ABC%20FLIX/icaro-pro-bus.html#L2726) |
| `<clip>` entity | `clips[]` array | [c-bus.html:603](file:///Users/gaia/ABC%20FLIX/c-bus.html#L603) |
| `<cursor>` state | `state.cur` | [icaro-pro-bus.html:657](file:///Users/gaia/ABC%20FLIX/icaro-pro-bus.html#L657) |
| `<camera>` state | `S.cam` | [c-bus.html:610](file:///Users/gaia/ABC%20FLIX/c-bus.html#L610) |
| `[emit-cursor-move]` | `_atoBusEmitCursor()` | [icaro-pro-bus.html:2776](file:///Users/gaia/ABC%20FLIX/icaro-pro-bus.html#L2776) |
| `[emit-goto-frame]` | Render loop camera sync block | [c-bus.html:2196](file:///Users/gaia/ABC%20FLIX/c-bus.html#L2196) |
| `[route-message]` | `window.addEventListener('message', ...)` | [harness.html:235](file:///Users/gaia/ABC%20FLIX/harness.html#L235) |
| Invariant **I-1** | Bidirectional sync + guards | Both files |
| Invariant **I-3** | `_busInboundGoto` + `_busCamLastFrame` | [icaro-pro-bus.html:2797](file:///Users/gaia/ABC%20FLIX/icaro-pro-bus.html#L2797), [c-bus.html:2919](file:///Users/gaia/ABC%20FLIX/c-bus.html#L2919) |
| Invariant **I-5** | `height: calc(50dvh - 14px)` | [harness.html:108](file:///Users/gaia/ABC%20FLIX/harness.html#L108) |
| `<safe>` assumption A-4 | `width: 100%; height: 100%` (not `100vw/100vh`) | [c-bus.html:43-57](file:///Users/gaia/ABC%20FLIX/c-bus.html#L43-L57) |
| Failure: feedback loop | Guard flags | Both emitter shims |
| Failure: stale bus | Heartbeat `setInterval` | [harness.html:330](file:///Users/gaia/ABC%20FLIX/harness.html#L330) |

---

## 9. `<Residual Human Theory>`

What the code does **not** capture — what a future maintainer must understand:

### The Coordinate Duality

The system operates in **two incommensurable coordinate spaces**:
- **Engine space**: discrete integer `<cursor>` in [0, N-1]
- **Tunnel space**: continuous float `<camera>` in (-inf, +inf)

The coupling formula `camera = cursor * SNAP * 2` is an **arbitrary convention**, not a mathematical necessity. If clip layout changes (variable duration, non-linear spacing), this formula must change. The formula appears in **four places** across two files — it is not centralized.

### The Iframe Trust Boundary

The system assumes both iframes are **same-origin**. If they were ever served from different origins, all `postMessage` calls would need explicit origin validation (`e.origin === expectedOrigin`). Currently the system accepts messages from `*`.

### The Monkey-Patch Architecture

The bus emitter shim works by **monkey-patching** existing functions (`rebuildTrack`, `renderOutput`, `engageSequence`). This means:
- The shim must be loaded **after** the original functions are defined
- Any future refactor of those functions must preserve the patching surface
- The patched functions are not idempotent — calling `rebuildTrack()` triggers a `FRAMES_SYNC` broadcast even if nothing changed

### The "Same-Worldness" Contract

The deepest assumption: **both instruments describe the same temporal sequence**. The tunnel does not have its own independent timeline — it is a **view** of the engine's frame array. If you ever want the tunnel to contain clips that do not correspond to engine frames (e.g., audio-only clips, annotation markers, structural segments), the entire coupling model must be rearchitected from "frame mirroring" to "shared timeline with heterogeneous content."

### The Mobile Layout Contract

Iframes on mobile are **not** like divs. They:
- Cannot use `height: auto` (defaults to 150px)
- Cannot reliably use `flex: 1` for height distribution
- Need explicit pixel or `calc()` heights
- Must use `100%` not `100vh` for internal full-height elements

This is not documented in any specification — it is empirical knowledge discovered through failure.

---

## 10. `<Constitutional Laws>`

These are the non-negotiable rules of the system:

```
LAW 1 — SAME-WORLDNESS
  The engine cursor and the tunnel camera must converge
  to the same frame index within one render cycle.

LAW 2 — NO ECHO
  A message received from the bus must never trigger
  the emission of the same message type back to the bus.

LAW 3 — EXPLICIT HEIGHT
  Every iframe must have an explicit CSS height computed
  from viewport units. No auto. No flex percentages.

LAW 4 — VERSIONED CACHE
  Every frame thumbnail in the tunnel must carry a version
  number matching the engine's frame._v. Stale thumbnails
  must be regenerated on the next FRAME_PATCH or FRAMES_SYNC.

LAW 5 — ASYNC BATCH
  Frame data processing in the tunnel must yield to the
  event loop every 8 frames to prevent UI freezing.

LAW 6 — THE DELTA MANDATE
  No instrument shall transmit the full state of the sequence
  during normal operations. All pixel mutations propagate as
  atomic FRAME_PATCH deltas. Full FRAMES_SYNC is restricted
  to initialization and crash recovery.

LAW 7 — CONSTANT MEMORY BOUND (O(1) LIMIT)
  The Tunnel shall never hold more than MAX_TEXTURES (32)
  rendered canvases. Raw grid data is stored unbounded (cheap).
  Only clips inside the camera frustum may possess textures.
  Exiting clips are evicted via LRU.

LAW 8 — THE IMMORTAL LEDGER [NOT YET IMPLEMENTED]
  RAM is a transient illusion. Every structural change or
  pixel mutation must be committed to the IndexedDB WAL
  asynchronously. [Phase 2]

LAW 9 — MAIN THREAD SANCTITY
  Heavy data transformations must not block the main thread.
  Canvas state operations (save/restore) per-clip not per-cell.
  rAF pooling caps message throughput to screen refresh rate.
  Live drawing sync uses 100ms debounce, not per-stroke emission.
```

---

## `<Message Protocol Reference>`

### Engine to Harness

| Message | Payload | Trigger |
|---------|---------|---------|
| `FRAMES_SYNC` | `{frames: [{index, grid, version}], total, cursor, gridW, gridH}` | Structural changes (add/delete/reorder) — boot/recovery |
| `FRAME_PATCH` | `{index, grid, version, gridW, gridH}` | Single frame pixel mutation (draw, stamp, erase) |
| `CURSOR_MOVE` | `{cursor, total}` | Active frame changes (click, step) |
| `PLAY_SYNC` | `{playing, cursor, total}` | Play/stop toggled |
| `RIP_PROGRESS` | `{phase: START/CHUNK/DONE, total, done}` | During video ingestion |

### Tunnel to Harness

| Message | Payload | Trigger |
|---------|---------|---------|
| `GOTO_FRAME` | `{cursor, source: 'camera'/'select'}` | Camera scrub, clip select, scroll, arrows, inertia |
| `CLIP_SELECT` | `{name, track, start, dur}` | Clip tapped/selected |

### Harness to Engine

| Message | Payload | Trigger |
|---------|---------|---------|
| `GOTO_FRAME` | (forwarded, rAF pooled) | Tunnel navigation |
| `PLAY_SYNC` | (forwarded from tunnel) | Tunnel play/stop |
| `REQUEST_SYNC` | `{}` | Tab refocus, tunnel load complete |

### Harness to Tunnel

| Message | Payload | Trigger |
|---------|---------|---------|
| `FRAMES_SYNC` | (forwarded from engine) | Engine structural changes |
| `FRAME_PATCH` | (forwarded from engine) | Engine pixel mutations |
| `CURSOR_MOVE` | (forwarded, rAF pooled) | Engine cursor changes |
| `PLAY_SYNC` | (forwarded from engine) | Engine play/stop |
| `VIEW_CYCLE` | `{view: int}` | Bus strip view button |
| `RIP_PROGRESS` | (forwarded from engine) | During video ingestion |
