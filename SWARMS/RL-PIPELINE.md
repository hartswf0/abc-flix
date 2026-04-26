# NSDS RL Pipeline — System Instructions

## Architecture Overview

The NSDS RL Pipeline is a family of reinforcement learning engines that operate on the **BEFLIX-128 dot-matrix grid** — the same substrate used by the `icaro-nsds-operator.html` spatiotemporal flow engine.

```
GRID:        128 columns × 96 rows = 12,288 cells
BLOCK SIZE:  5px × 5px per cell (dot-matrix rendering)
CANVAS:      640px × 480px (128 × 5 = 640, 96 × 5 = 480)
INK LEVELS:  8 (0=white/empty → 7=black/max dot)
PALETTE:     Monochrome alpha gradient [0,40,80,120,160,200,230,255]
```

---

## Pipeline Hierarchy

```
┌─────────────────────────────────────────────────────┐
│  LEVEL 2: BEFLIX CODE-GEN RL                        │
│  Agent writes BEFLIX tokens (CLR, PNT, SHIFT)       │
│  instead of moving pixels.                          │
│  Output = executable program.                       │
│  Bridge to LLM code generation.                     │
├─────────────────────────────────────────────────────┤
│  LEVEL 1: HIERARCHICAL META-RL                      │
│  L1 meta-agent trains L0 swarm.                     │
│  Controls: epsilon, crowding, interference mode,    │
│  gradient weighting.                                │
│  Constructive / Destructive / Adaptive interference │
├─────────────────────────────────────────────────────┤
│  LEVEL 0: SWARM RL (two variants)                   │
│  ┌──────────────────┬──────────────────────┐        │
│  │ MULTI-AGENT      │ SINGLE-AGENT         │        │
│  │ 1 Q-table/patch  │ 1 global Q-table     │        │
│  │ Decentralized    │ Centralized          │        │
│  │ Boundary coupling│ Value fn viz         │        │
│  └──────────────────┴──────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

---

## NSDS Operator Compliance

All pipelines MUST match the NSDS operator's exact specifications:

### Grid System
| Parameter | Value | Source |
|-----------|-------|--------|
| `G_COLS` | 128 | icaro-nsds-operator.html:2009 |
| `G_ROWS` | 96 | icaro-nsds-operator.html:2009 |
| `B_SZ` | 5 | icaro-nsds-operator.html:2009 |
| Canvas W | 640 (128×5) | icaro-nsds-operator.html:2009 |
| Canvas H | 480 (96×5) | icaro-nsds-operator.html:2009 |
| Ink count | 8 (0-7) | icaro-nsds-operator.html:2012 |

### Ink Palette (dot-matrix alpha values)
```
INK 0: rgba(0,0,0,  0)   — empty (white field)
INK 1: rgba(0,0,0, 40)   — ghost dot
INK 2: rgba(0,0,0, 80)   — faint dot
INK 3: rgba(0,0,0,120)   — quarter dot
INK 4: rgba(0,0,0,160)   — half dot
INK 5: rgba(0,0,0,200)   — heavy dot
INK 6: rgba(0,0,0,230)   — near-black dot
INK 7: rgba(0,0,0,255)   — full black dot
```

### Dot-Matrix Rendering
Each cell renders as a **circular dot** within its 5×5 pixel block:
```javascript
// Dot radius scales with ink level
const maxR = B_SZ * 0.45;  // 2.25px max radius
const r = maxR * (ink / 7);
// Draw filled circle at center of block
ctx.arc(B_SZ/2, B_SZ/2, Math.max(0.4, r), 0, Math.PI*2);
```

### BEFLIX Token Format
The decompiler in the NSDS operator produces these token types:
```
CLR  x,y w,h ink    — Clear region with background ink
PNT  x,y w,h ink    — Paint rectangle (run-length encoded, vertically merged)
SHIFT dx,dy          — Translate entire canvas content
```

Token decompilation process:
1. Detect background ink (most frequent value)
2. Run-length encode rows into PNT tokens (skip background)
3. Merge vertically adjacent PNTs with matching x, w, ink
4. Result: compressed program that reproduces the frame

---

## State-Action Spaces

### Level 0: Swarm Agents
```
STATE:   (x, y) on the 128×96 grid = 12,288 states
ACTIONS: {up, right, down, left, stay} = 5 actions
Q-TABLE: 12,288 × 5 = 61,440 entries

REWARD FUNCTION:
  R(s,a) = target_density(s')        * 1.0    // primary signal
         + gradient_climb(s→s')       * climb  // follow brightness gradient
         + interference_bonus(s')     * intW   // constructive/destructive field
         - crowding_penalty(s')       * crowd  // discourage stacking
         - step_cost                  * 0.008  // small cost for movement
```

### Level 1: Meta-Agent (Hierarchical)
```
STATE:   (match_bucket, reward_bucket, coherence_bucket)
         5 × 5 × 5 = 125 states
ACTIONS: {eps_up, eps_down, crowd_up, crowd_down,
          mode_constructive, mode_destructive,
          boost_interference, relax_interference} = 8 actions
Q-TABLE: 125 × 8 = 1,000 entries

META-REWARD:
  R_meta = improvement_in_match * 10 + current_match * 0.5
  (computed over a meta-interval of N L0 training ticks)
```

### Level 2: BEFLIX Code-Gen
```
STATE:   (block_target_ink, block_canvas_ink, position_bucket)
         8 × 8 × 4 = 256 states
ACTIONS: {paint ink 0, paint ink 1, ..., paint ink 7} = 8 actions
Q-TABLE: 256 × 8 = 2,048 entries

REWARD:
  R = MSE_reduction * 50 + local_match * 0.5 - redundancy_penalty
  (MSE computed before and after executing the PNT token)
```

---

## Macroblock Grid

The NSDS operator operates at the cell level (128×96), but RL pipelines can use macroblocks for computational efficiency:

| Block Size | Grid | Block Count | Notes |
|------------|------|-------------|-------|
| 1×1 | 128×96 | 12,288 | Full resolution (cell-level) |
| 4×4 | 32×24 | 768 | High detail |
| 8×8 | 16×12 | 192 | Standard patch |
| 16×16 | 8×6 | 48 | Coarse (current default) |
| 32×32 | 4×3 | 12 | Ultra-coarse |

---

## Video Ingest Pipeline

All pipelines share the same target extraction:
```javascript
// Sample video frame at grid resolution
ctx.drawImage(video, 0, 0, G_COLS, G_ROWS);
const pixels = ctx.getImageData(0, 0, G_COLS, G_ROWS).data;

// Convert to luminance → ink level
for (let i = 0; i < N; i++) {
    const lum = 0.2126*R + 0.7152*G + 0.0722*B;  // BT.709
    const norm = pow(clamp((lum/255 - threshold) / (1 - threshold), 0, 1), contrast);
    target[i] = round(norm * 7);  // quantize to 8 ink levels
}
```

---

## Export Formats

### BEFLIX .bfx (Code-Gen output)
```
; BEFLIX-128 GENERATED CODE
; Grid: 128x96
; Tokens: 1069321
; MSE: 3.828
; Match: 61%
;
CLR 0
PNT 16,0 16x16 7
PNT 80,0 16x16 2
...
```

### Policy JSON (Q-table export)
```json
{
  "type": "hierarchical-meta-rl",
  "L0": {
    "grid": { "cols": 128, "rows": 96 },
    "Q": [/* 61440 float entries */],
    "agents": 200,
    "epsilon": 0.003,
    "crowd": 0.78
  },
  "L1": {
    "states": 125,
    "actions": ["eps_up","eps_down","crowd_up","crowd_down",
                "mode_constructive","mode_destructive",
                "boost_int","relax_int"],
    "Q": [/* 1000 float entries */],
    "metaFrame": 13359,
    "metaEps": 0.008
  },
  "frame": 268703,
  "match": 0.15
}
```

---

## Playback Engine

`rl-playback.html` loads either format via FileReader (drag-and-drop or file picker). No fetch — works on `file://`.

### Views
- **Canvas (ink)** — rendered as dot-matrix
- **Paint Heatmap** — how many times each cell was painted
- **Ink Spectrum** — color-coded by ink level
- **Frame Diff** — highlights what changed between steps
- **Value Function** — Q value magnitude per cell
- **Policy Arrows** — best action direction per cell

### Policy Extraction
Analyzes the loaded data to produce:
- Per-block ink convergence (which ink the agent settled on)
- Global ink usage histogram
- Action distribution (for Q-table data)
- Re-generation: applies converged policy to fresh canvas

---

## Integration with NSDS Operator

### Token Round-Trip
```
NSDS Operator                    RL Pipeline
    │                                │
    │  decompileToTokens(frame) ──→  │  target tokens
    │                                │
    │                                │  RL generates PNT tokens
    │                                │
    │  ←── applyGridToFrame(grid)    │  canvas grid
    │                                │
    │  matchTokens(A, B) ──────────→ │  spatial overlap score
    │                                │
    │  exportKinematicTensor() ──→   │  flow + code + delta tensors
```

### Dual Tensor Export
The NSDS operator can export a combined tensor:
- `pixel_tensor`: raw ink grids per frame
- `code_tensor`: BEFLIX tokens per frame
- `delta_tensor`: token-to-token motion deltas
- `flow_tensor`: kinematic vectors (optical flow)

This tensor IS the training data for the RL pipeline.

---

## File Inventory

| File | Role |
|------|------|
| `rl-multi-agent.html` | Decentralized patch RL (144 Q-tables) |
| `rl-single-agent.html` | Centralized global RL (1 Q-table) |
| `rl-hierarchical.html` | Meta-RL: agent that trains the agent |
| `rl-beflix-coder.html` | Code-gen RL: writes BEFLIX programs |
| `rl-playback.html` | Loads + visualizes exported policies/code |
| `RL-PIPELINE.md` | This document |
