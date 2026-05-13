# PFLIX — PHOTONIC FLICKS

> **A BEFLIX-inspired programming language / visual interface for learning, simulating, and composing photonic wave behavior.**

---

## The Core Reframe

BEFLIX was not just animation. It was: code → image → frame → motion picture.

PFLIX would be: code → waveguide → interference → output field → photonic behavior.

```text
BEFLIX: programming pixels into motion
PFLIX:  programming light waves into behavior
```

That is the conceptual diamond.

---

## Why This Is Stronger Than "PhotonCodec"

A codec claim makes experts ask: Where is the bitstream? Where is entropy coding? Where is rate control? Where is the decoder? Why use photonics here?

PFLIX makes them ask a better question: **Can this interface help people understand and prototype photonic behavior?**

---

## Program Theory

```text
<PFLIX> is not <a photonic codec>
<PFLIX> is <a beginner-facing language for composing light-wave behavior>
<PFLIX> takes <simple commands>
and generates <photonic simulation scenes>
where users can see <light splitting, combining, delaying, interfering, canceling, reinforcing, and being detected>
```

The purpose: **make photonics feel programmable before it feels impossible.**

---

## PFLIX as "BEFLIX for Photonics"

```text
BEFLIX commands: CLR, PNT, LIN, REC, SHF — for drawing raster animation
PFLIX commands:  WAVE, GUIDE, SPLIT, PHASE, MIX, DETECT, REC — for composing light behavior
```

Example PFLIX script:

```text
CLR
WAVE input_a 1.0 phase 0
WAVE input_b 1.0 phase 180
GUIDE input_a coupler_1
GUIDE input_b coupler_1
MIX coupler_1
DETECT out_1
DETECT out_2
REC 30
```

Meaning: Send two light waves into a coupler, make them interfere, detect the outputs, and record the behavior. Not "simulate all photonics." Just make a small grammar where light becomes composable.

---

## PFLIX Primitive Vocabulary

```yaml
PFLIX_primitives:
  WAVE:   {meaning: "Create an input light signal.",   example: "WAVE A amplitude 1.0 phase 0"}
  GUIDE:  {meaning: "Route light through a waveguide.", example: "GUIDE A path_1"}
  SPLIT:  {meaning: "Divide light into two paths.",     example: "SPLIT A 50/50"}
  PHASE:  {meaning: "Delay or shift a wave.",           example: "PHASE path_2 180"}
  MIX:    {meaning: "Recombine two waves.",             example: "MIX path_1 path_2"}
  FILTER: {meaning: "Select or suppress wavelength bands.", example: "FILTER lambda 1550nm"}
  DETECT: {meaning: "Measure output power.",            example: "DETECT output_1"}
  REC:    {meaning: "Record frames of the simulation.", example: "REC 60"}
```

---

## Core Demos

### Demo 1 — Constructive Interference
```text
WAVE A amp 1 phase 0 | WAVE B amp 1 phase 0 | MIX A B | DETECT OUT
→ waves align → output stronger
```

### Demo 2 — Destructive Interference
```text
WAVE A amp 1 phase 0 | WAVE B amp 1 phase 180 | MIX A B | DETECT OUT
→ waves oppose → output weak / canceled
```

### Demo 3 — Edge Detector Analogy
```text
WAVE LEFT amp 1 phase 0 | WAVE RIGHT amp 0 phase 0 | MIX LEFT RIGHT | DETECT AVG | DETECT DIFF
→ same signals → average channel; different signals → difference channel
```

---

## The Real Claim

PFLIX is valuable because photonics is hard to enter. Most beginners do not have intuition for phase, interference, waveguides, couplers, modes, ports, wavelength, detectors.

PFLIX would turn those into visible operations: write command → see wave → change phase → see cancellation → split path → see two outputs → mix paths → see interference.

That is how BEFLIX operated culturally: it gave people a way to think computationally about moving images. **PFLIX would give people a way to think computationally about moving light.**

---

## The Minimum Hackathon Version

Build a tiny PFLIX interpreter / visual demo that shows:
1. User writes simple PFLIX commands.
2. System generates a simple photonic circuit diagram.
3. System explains what the light should do.
4. System optionally sends the structure for PhotonForge / Tidy3D-style simulation.
5. User sees outputs: constructive interference, destructive interference, splitting, phase shift.

---

## Final Hackathon Abstract

**PFLIX — Photonic Flicks** is a BEFLIX-inspired experimental language for composing and visualizing photonic behavior. Where BEFLIX used simple commands to generate computer animation frames, PFLIX uses simple commands to generate photonic wave scenes: light sources, waveguides, splitters, phase shifts, interference events, and detectors.

The project is not a photonic codec and does not claim to replace electronic computation. PFLIX gives beginners a command grammar for exploring wave operations visually. The goal is to test whether AI-guided prompting plus a BEFLIX-style command language can help a non-expert enter photonics without pretending to already be an expert.

---

## Strong Final Framing

> **PFLIX is a BEFLIX-inspired language for photonics. BEFLIX made computer animation programmable at the moment animation was becoming computational. PFLIX makes light-wave behavior programmable at the moment photonic computing is becoming culturally and technically legible.**

---

## Final One-Liner

> **PFLIX is BEFLIX for photonics: a small command language that lets users program, visualize, and learn the behavior of light waves on a chip.**
