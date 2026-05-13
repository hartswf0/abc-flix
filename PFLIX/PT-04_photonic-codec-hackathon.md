# PROGRAM THEORY — PHOTONIC VIDEO CODEC HACKATHON IDEA

> A video codec uses math to separate what matters from what can be discarded. A photonic chip can perform part of that math physically.

---

## Core Morphism

```text
<Video Block> [is encoded as] <Optical Amplitudes>
<Optical Amplitudes> [pass through] <Photonic Transform Circuit>
<Photonic Transform Circuit> [outputs] <Low-Frequency + High-Frequency Components>
<Software Codec> [quantizes / discards] <Less Important Components>
```

The hackathon idea: build a **photonic transform primitive** — a tiny optical circuit that performs the same conceptual job as the DCT / transform stage in codecs.

---

## The Feasible Version: A 4-Pixel Optical Haar / DCT-Like Transform Cell

```text
Input:  [pixel_1, pixel_2, pixel_3, pixel_4]
Output: average / low-frequency signal
        edge / difference signal
        texture / high-frequency signal
```

The chip does not "store video." The chip physically performs the first act of compression: **separating structure from detail**.

---

## What You Would Actually Build

```yaml
project:
  name: "PhotonCodec"
  object: "Photonic transform cell for codec preprocessing"
  input: "4 optical input channels representing pixel/block intensity values"
  photonic_components:
    - "waveguides"
    - "directional couplers or MMI couplers"
    - "Mach-Zehnder interferometer-style mixing"
    - "output ports for sum/difference components"
  output:
    - "low-frequency / average component"
    - "horizontal or pairwise difference component"
    - "high-frequency detail component"
  software_layer:
    - "read simulated output powers"
    - "classify which outputs are visually important"
    - "apply toy quantization"
    - "show compression decision"
```

---

## Program Theory Diagram

```text
[Raw Video Block] → [Pixel Intensities] → [Optical Encoding] → [Photonic Transform Cell] → [Output Port Powers] → [Coefficient Interpretation] → [Quantization / Discard Rule] → [Compressed Representation]
```

---

## Demo Test Patterns

```text
Test A: uniform block [1, 1, 1, 1]
  Expected: strong low-frequency output, weak difference outputs

Test B: edge block [1, 1, 0, 0]
  Expected: low-frequency plus strong difference output

Test C: texture block [1, 0, 1, 0]
  Expected: higher-frequency output activation
```

Same photonic circuit, different input patterns, different output coefficient signatures. That is exactly the codec story.

---

## One-Sentence Version

> **PhotonCodec is a photonic transform cell that uses light interference to separate video-block structure from detail, creating a hardware primitive for future optical video compression.**
