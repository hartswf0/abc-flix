# PFLIX WORLD MODEL — SCHMIDHUBER SYNTHESIS

> **BEFLIX made computer animation programmable. Codecs made moving images compressible. World models make environments internally predictable. Photonics makes light-wave behavior physically computable. PFLIX would make photonic behavior programmable, visible, compressible, and learnable.**

---

## 1. The Big Translation

Schmidhuber's world model idea is not mainly "generate cool worlds." It is:

```text
agent observes world → compresses sensory stream into latent representation → predicts what happens next → uses prediction to plan actions → becomes curious about what improves the model
```

The 2018 Ha/Schmidhuber "World Models" project: Vision compresses frames into a latent vector, Memory predicts future latent vectors, Controller chooses actions from the current latent state.

---

## 2. Codec vs. World Model

Both compress reality. For different reasons.

```text
CODEC:       compress so another machine can reconstruct video for a viewer
WORLD MODEL: compress so an agent can predict, plan, and act
```

A codec asks: What can I throw away while preserving appearance?
A world model asks: What must I remember to predict what happens next?

> PFLIX should not just compress photonic behavior. It should help a learner build a world model of photonic behavior.

---

## 3. BEFLIX as World Generator

BEFLIX was not merely "old animation." It was a language for producing moving images from code. Ken Knowlton developed BEFLIX at Bell Labs in 1963.

BEFLIX is already a **little world generator**: command → raster operation → frame → motion sequence.

Ordinary video says: record the world. BEFLIX says: **program a world.**

---

## 4. PFLIX as Photonic World Generator

```text
BEFLIX: program pixels into motion
PFLIX:  program light waves into behavior
```

PFLIX commands would create wave behavior:

```text
WAVE A amp 1 phase 0 | SPLIT A 50/50 | PHASE path_2 180 | MIX path_1 path_2 | DETECT out_1 | REC 60
```

PFLIX is not a codec. It is: **a world-modeling interface for photonic behavior.**

---

## 5. Where Compression Fits

Schmidhuber's deeper bridge is **compression progress**. A controller can be intrinsically rewarded by the world model's learning progress rather than raw prediction error (avoids the "noisy TV" problem).

A PFLIX learner should not be rewarded for flashy random wave mess. It should be rewarded for discovering patterns that become compressible:

```text
boring:      already predictable
bad:         random, never learnable
interesting: surprising at first, then learnable
```

That is exactly what photonics pedagogy needs.

---

## 6. The Unified Stack

```text
BEFLIX       code → raster frames → historical computer animation
CODEC        frames → compressed bitstream → playback
WORLD MODEL  observations + actions → latent model → prediction/planning
PHOTONICS    light waves → interference → measured outputs
PFLIX        commands → photonic wave scenes → learnable simulations
```

> PFLIX is a BEFLIX-style language plus a world-model loop for learning photonics.

---

## 7. Program Theory — PFLIX World Model

```text
<PFLIX Command> [generates] <Photonic Scene>
<Photonic Scene> [contains] <waves, paths, phase shifts, couplers, detectors>
<Simulation> [produces] <Field Behavior + Output Powers>
<World Model> [compresses] <the relation between commands and outcomes>
<Controller / Prompting Agent> [chooses] <next photonic experiment>
<Curiosity Reward> [comes from] <improved prediction / compression progress>
<Human Learner> [uses] <the system to build intuition>
```

---

## 8. How Codecs Still Matter

Codecs matter here as the analogy of **structured loss and prediction**.

```text
A codec says:      Do not store all pixels. Store enough structure to reconstruct useful motion.
A world model says: Do not remember all observations. Learn enough structure to predict useful futures.
PFLIX says:         Do not drown the novice in Maxwell equations. Expose enough wave behavior that the learner can predict what light will do.
```

The codec is not the product. The codec is the philosophical bridge:

> **Compression is not just file reduction. Compression is understanding.**

That is pure Schmidhuber.

---

## 9. The Non-Bullshit Claim

Do not say: "PFLIX makes a photonic codec."

Say: **"PFLIX uses codec logic and world-model theory to make photonic behavior learnable. It treats photonic simulation as a compressed, programmable environment where a novice and an AI agent can explore wave behavior through commands, predictions, and curiosity-driven experiments."**

---

## 10. The Final Diamond

> **BEFLIX was a programming language for making images move. PFLIX is a programming language for making light-wave behavior intelligible. World models provide the learning loop: compress the behavior, predict what happens next, and choose new experiments where prediction improves. Codecs provide the metaphor of compression; photonics provides the physical substrate; BEFLIX provides the historical interface model.**

That is the synthesis.

---

## References

- Ha, D. & Schmidhuber, J. (2018). Recurrent World Models Facilitate Policy Evolution. NeurIPS. [worldmodels.github.io](https://worldmodels.github.io/)
- Schmidhuber, J. (2015). On Learning to Think: Algorithmic Information Theory for Novel Combinations of RL Controllers and RNN World Models. [arXiv:1511.09249](https://arxiv.org/abs/1511.09249)
- Knowlton, K. (1963). BEFLIX Computer Animation Language, Bell Labs. [History of Information](https://www.historyofinformation.com/detail.php?id=3467)
- Schmidhuber, J. (1990–2026). Artificial Curiosity Since 1990. [people.idsia.ch](https://people.idsia.ch/~juergen/artificial-curiosity-since-1990.html)
