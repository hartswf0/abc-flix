# ABC FLIX — ATO-BUS Production Harness

A high-performance operative editing workbench combining the **ICARO-PRO** pixel engine with the **ARC-TUNNEL** spatial clip editor, connected via a real-time message bus.

## Quick Start

```bash
# Serve locally (any static server)
python3 -m http.server 8888

# Open in browser
open http://localhost:8888/
```

Entry point: `index.html` (alias of `harness.html`)

## Architecture

```
┌──────────────────────────────────────┐
│           index.html / harness.html  │  ← Router + Bus Strip
├──────────────────────────────────────┤
│           icaro-pro-bus.html         │  ← Engine (BEFLIX pixel editor + timeline)
├──────── bus-strip (18px) ────────────┤
│           c-bus.html                 │  ← Tunnel (ARC barrel + 4 spatial views)
└──────────────────────────────────────┘
```

### Message Bus Protocol

| Message | Direction | Purpose |
|---|---|---|
| `FRAMES_SYNC` | Engine → Tunnel | Full frame grid data for clip thumbnails |
| `CURSOR_MOVE` | Engine → Tunnel | Playhead position sync |
| `PLAY_SYNC` | Bidirectional | Play/stop state sync |
| `GOTO_FRAME` | Tunnel → Engine | Navigate to selected clip's frame |
| `RIP_PROGRESS` | Engine → Tunnel | Loading state (START/CHUNK/DONE) |
| `VIEW_CYCLE` | Harness → Tunnel | Cycle between barrel/inside/outside/side/bench |
| `CLIP_SELECT` | Tunnel → Harness | Selected clip name for bus strip display |
| `REQUEST_SYNC` | Harness → Engine | Request full re-sync (tab switch, reconnect) |

### Files

| File | Size | Purpose |
|---|---|---|
| `index.html` | 14KB | Entry point (harness router + bus strip UI) |
| `harness.html` | 14KB | Same as index.html |
| `icaro-pro-bus.html` | 148KB | ICARO-PRO engine with bus bridge emitter |
| `c-bus.html` | 130KB | ARC-TUNNEL operator with bus receiver |

## Features

### ICARO-PRO Engine (Top)
- **BEFLIX pixel editor** — 7-level grayscale matrix drawing
- **Frame timeline** — scrub, navigate, duplicate, delete frames
- **Video import** — load MP4/WebM, rip frames at 12fps (max 12 seconds / 144 frames)
- **Film Leader** — generate 5-second test countdown
- **BEFLIX scripting** — programmatic pixel animation via CLR/PNT/LIN/REC/SHF commands
- **Drawing tools** — pen, rectangle, eraser with size control

### ARC-TUNNEL Operator (Bottom)
- **5 spatial views**: Barrel (3D cylinder), Inside, Outside, Side, Bench (flat timeline)
- **Clip management** — move, trim, roll, lift, split, route, store
- **4 probability tracks** — POSSIBLE, PLAUSIBLE, PROBABLE, PREFERRED
- **Frame thumbnails** — engine frames rendered as textures on clip faces
- **LOD rendering** — adaptive geometry detail based on depth

### Bus Strip (Middle)
- Real-time sync indicator (green dot = live, red pulse = sync)
- Frame count, cursor position, clip name display
- Progress bar during frame ripping
- View cycle button
- Draggable divider for resize

## Performance

Optimizations applied (V3+):

| Technique | Impact |
|---|---|
| LOD geometry | Far clips: 16 cells instead of 204 (−92%) |
| Thumbnail throttle | 1 drawImage/clip instead of 204 (−99.5%) |
| Far-cell stroke skip | No outline on depth > 4500 |
| CanvasPattern hatch | Pre-rendered pattern tiles, no ctx.clip() |
| Lazy layer allocation | scriptLayer/handLayer = null until drawn |
| Demand-driven render | Loop sleeps after 500ms idle |
| Realtime rAF capture | Non-blocking video frame extraction |
| Throttled bus sync | Progress messages every 2s, not per-frame |

### Performance HUD

Press **`` ` ``** (backtick) while the tunnel is focused to toggle live metrics:

```
24.0 fps · 3.2ms/f · idle 83% · bus 0.5/s · SLEEP · 106 clips · DPR 1.5
```

## Loading Workflow

1. Open `http://localhost:8888/`
2. Click **A** tab → **FILM LEADER** (generates 60-frame test sequence)
3. Or click **A** tab → **LOAD CLIPS** to import video (MP4/WebM, max 12 seconds)
4. Tunnel auto-populates with clips distributed across 4 probability tracks
5. Use tunnel tools (MOVE, TRIM, ROLL, LIFT, SPLIT) to arrange clips
6. Navigate with arrow keys, jog wheel, or back/forward buttons

## Loading States

During frame ripping or Film Leader generation:
- **Engine** (top): Dark overlay with spinning film reel + frame counter
- **Tunnel** (bottom): Dark overlay with spinning film reel + progress bar
- **Bus strip** (middle): Red progress bar + "RIP N/M" status

## Mobile

- Single-instrument view (toggle ENGINE/TUNNEL via bus strip button)
- Reduced DPR (1.0) for performance
- Fewer cells per clip (mobile LOD)
- Touch-friendly dock buttons

## License

Operative instrument. All rights reserved.
