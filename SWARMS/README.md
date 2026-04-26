# SWARMS

Spatiotemporal animation tools from the ICARO operative ecology. All files are self-contained, zero-dependency HTML. Open any directly in a browser.

## Canonical Tools

### icaro-compiler.html
**BEFLIX Spatiotemporal Compiler.** Draw on a 128×96 grid, 8-ink palette, 3-layer compositing (source/script/hand). BEFLIX script grammar for procedural animation. Round-trip fidelity testing: frame → grid → code → tokens → reconstruct → error score. Flow analysis with heuristic displacement vectors, motion heat, prediction. Export: PNG, GIF, WebM, MP4, contact sheet, project JSON, analysis JSON, EDL. Camera capture. Media ingest (image/video). Procedural generators: typewriter, scroll, ripple, flicker, onion trail, slideshow.

### icaro-choreography.html
**Latent Choreography Kernel.** Particle swarm simulator with boid physics (alignment, cohesion, separation). Hidden fields: predator eyes, vortices, oscillators, shear channels. Standing-wave resonance manifold (Chladni patterns). Inverse inference engine: observe trajectories → cluster swarms → guess hidden field configuration. Live equation sketch.

### icaro-pro-v2.html
**ICARO-PRO v2 — the ancestral genome.** Compact 258-line prototype. 128×96 BEFLIX grid, timeline, round-trip decompiler, flow analysis, prediction, dream engine, tensor export. The original from which `icaro-compiler.html` evolved.

## Extended Console Variants

These are expanding forks of the flow console. Each adds specific capabilities but shares ~80% of engine code with the others.

| File | Focus | Lines |
|------|-------|-------|
| `icaro-flow-console.html` | Extended flow diagnostics | 5137 |
| `icaro-resonance-console.html` | Standing-wave resonance overlays | 5921 |
| `icaro-policy-console.html` | NSDS-influenced policy/training UI | 6256 |
| `icaro-nsds-operator.html` | NSDS analysis operator | 4650 |
| `icaro-swarm-operator.html` | Swarm + resonance operator | 4890 |

## What's Not Here (Yet)

- Shared state between tools (choreography → frame capture bridge)
- IndexedDB persistence
- Connection to ARGO world-graph or Golden Egg spatial editor
- Audio/soundtrack integration from the Achilles engine

## Filesystem Note

The former `SWARMS_01/` directory was an identical pre-README copy and has been removed. The duplicates `icaro-flow-v2 (1).html` and `preview (27).html` were browser/preview download artifacts and have also been removed.
