# FINAL VERSION — PROGRAM THEORY: PROMPTED OPTICAL PRE-CODEC

**Working Title:** Prompted Optical Pre-Codec: AI-Guided Photonic Decomposition of Sparse Raster Animation

> This project tests whether an AI-guided non-expert can design a tiny photonic pre-processing primitive that uses light-wave interference to separate simple raster images into compression-relevant signals: flat fields, edges, and detail.

---

## 1. Core Claim

This is **not** a photonic video codec. It is not a replacement for AV1, H.264, HEVC, FFmpeg, or any modern software codec.

> A normal codec compresses visual data **after** pixels have already been measured.
> An optical pre-codec asks whether some compression-relevant structure can be detected **before or near measurement**, while the signal is still light.

```text
Normal codec:   measure everything → make pixels → compress later
Optical pre-codec: shape the light first → measure smarter signals → compress less waste later
```

---

## 2. First-Principles Mental Model

Photonics is not "a light version of a CPU." Photonics is **wave plumbing**.

Light moves like ripples. A photonic chip guides those ripples through tiny paths. Those paths can: split light, delay light, recombine light, cancel light, strengthen light, filter light, and reveal differences between signals.

The key physical idea is **interference**:
- Two waves aligned: crest + crest = stronger signal
- Two waves opposed: crest + trough = cancellation

---

## 3. Why This Connects to Codecs

A codec asks: What is repeated? What is stable? What changed? Where are the edges? Where is the detail? What can be ignored? What must be preserved?

A photonic pre-codec asks a smaller physical version: Can light itself help separate flat regions, edges, differences, and high-detail patterns before the normal digital codec begins?

---

## 4. Why BEFLIX Matters

BEFLIX-style animation is useful because it is simple, historical, and structured: flat fields, hard edges, binary contrast, simple motion, low noise, visible raster structure, algorithmic drawing logic.

BEFLIX does **not** need photonics to be compressed. BEFLIX is not the market. **BEFLIX is the test world.**

---

## 5. Program Theory Diagram

```text
<BEFLIX-like Raster Frame> → <Small Image Patch> → <Optical Input Channels> → <Photonic Wave-Interference Circuit> → <Output Port Powers> → <Flat / Edge / Detail Classification> → <Compression-Relevant Signal> → <Normal Digital Codec Could Use This Later>
```

---

## 6. Core Program Theory

```text
<Visual Information> is too large to store directly.
<Codec Engineering> reduces it after measurement: pixels first, compression second.
<Optical Pre-Codec Engineering> asks whether reduction can begin earlier: wave transformation first, smarter measurement second.
<BEFLIX-style Animation> provides clean raster patterns: flat fields, edges, and discrete changes.
<Photonics> provides controlled wave behavior: splitting, interference, cancellation, reinforcement.
<AI Prompting> provides the novice bridge: translating codec ideas into photonic design steps.

Therefore: This project is an AI-guided experiment in designing a tiny photonic pre-codec primitive.
It tests whether simple visual patterns can produce meaningfully different optical outputs before ordinary digital compression.
```

---

## 7. The Minimum Viable Hackathon Project

Build one tiny simulated primitive. A small optical transform cell that distinguishes three input types:

```text
Flat:   1 1    →  average output strong, edge/detail outputs weak
        1 1

Edge:   1 0    →  difference output strong
        1 0

Detail: 1 0    →  detail output strong
        0 1
```

If the circuit produces different output signatures for different patterns, the project works.

---

## 8. What the Photonic Chip Is Actually Doing

It is not "understanding" the image. It is not "watching video." It is not "compressing a movie."

```text
take a few input light signals → mix them through waveguides / couplers / interferometers → measure output strengths → use those strengths as clues about image structure
```

In codec terms: image patch → transform-like coefficients.
In photonics terms: optical inputs → interference network → output port powers.

---

## 9. Honest Non-Bullshit Framing

Bad: "I am building a photonic codec for BEFLIX."

Better: "I am simulating a photonic pre-codec primitive for sparse raster graphics."

Best: **"This project tests whether AI prompting can help a non-photonics expert translate codec theory into a simulated optical signal-processing primitive. BEFLIX-style animation supplies clean historical test patterns because its flat fields and hard edges make compression-relevant structure visible."**

---

## 10. The Strongest Intellectual Sentence

> A codec is a theory of what not to store.
> An optical pre-codec is a theory of what not to measure.

---

## 11. Final Hackathon Abstract

**Prompted Optical Pre-Codec** is an AI-guided photonics experiment inspired by video codec theory and historical computer animation. The project does not attempt to build a full video codec. Instead, it asks whether a small photonic circuit can perform a compression-relevant preprocessing operation before normal digital encoding begins.

Using BEFLIX-style raster patterns as clean test inputs, the project simulates a tiny photonic interference network that separates flat-field energy from edge and detail energy. The value lies not in replacing AV1, but in documenting the AI-assisted translation chain: from media theory and codec logic, through photonic design, to a simulated physical primitive.

---

## 12. Final One-Liner

> **A codec decides what not to store. An optical pre-codec decides what not to measure. This project tests whether AI can help a non-expert build the second from the logic of the first.**
