#!/bin/bash
# PFLIX voiceover — trimmed to fit 10-15s animation windows
# ~40 words per chapter at 180 WPM ≈ 13-14s each

VOICE="Samantha"
RATE=180
DIR="/Users/gaia/ABC FLIX/PFLIX/audio"

echo "Generating trimmed PFLIX voiceover..."
echo ""

# CH01 — Video Codec Engineering (target: 13.6s)
say -v "$VOICE" -r $RATE -o "$DIR/ch01.aiff" \
"Raw video enters the machine. The codec cuts it into frames, separates light from color, and tessellates each frame into blocks. A prediction engine finds what moved. Only the error is stored. The quantization guillotine destroys what the eye will forgive. Plausible motion survives."

# CH02 — FlexCompute Hackathon (target: 10.0s)
say -v "$VOICE" -r $RATE -o "$DIR/ch02.aiff" \
"An invitation opens the funnel. Outsiders become participants. PhotonForge turns a chip idea into layout. Tidy 3D simulates light through geometry. Seventy-two hours of pressure. The submission proves competence."

# CH03 — Unified Signal Platforms (target: 13.2s)
say -v "$VOICE" -r $RATE -o "$DIR/ch03.aiff" \
"Two systems share one signal problem. Video floods the left. Photonics floods the right. Both decompose into computable units. The codec asks what the eye forgives. The photonic platform asks what light will do. Two pipelines merge into one governance structure."

# CH04 — Photonic Codec Hackathon (target: 13.7s)
say -v "$VOICE" -r $RATE -o "$DIR/ch04.aiff" \
"Four pixels become optical amplitudes. Couplers mix them into sum and difference paths. Mach Zehnder interference separates structure from detail. Uniform blocks yield strong averages. Edge blocks activate difference ports. Output powers become coefficients. Light performs the first act of compression."

# CH05 — BEFLIX PhotonCodec (target: 14.3s)
say -v "$VOICE" -r $RATE -o "$DIR/ch05.aiff" \
"BEFLIX is not camera footage. It is flat fields, hard edges, raster logic. Sparse graphics decompose into cells: flat, edge, empty, delta. The photonic transform separates structure from detail. Commands and coefficients are stored. A playback engine reconstructs motion."

# CH06 — Sanity Check (target: 14.0s)
say -v "$VOICE" -r $RATE -o "$DIR/ch06.aiff" \
"The grand claim appears too large. A sanity check crushes it. A tiny transform cell is not a full codec. The honest kernel emerges: an optical raster decomposer. Two by two patches enter a Haar cell. Outputs classify: field, edge, checker, delta. A pre-codec primitive. Not a codec."

# CH07 — First Principles Optical Precoder (target: 14.9s)
say -v "$VOICE" -r $RATE -o "$DIR/ch07.aiff" \
"Light hits a sensor, becomes pixels, becomes too much data. A normal codec compresses after measurement. The optical pre-codec moves work upstream. Raw light passes through an optical transform. Structure and detail separate before digitization. A theory of what not to measure."

# CH08 — Final Prompted Optical Precoder (target: 14.8s)
say -v "$VOICE" -r $RATE -o "$DIR/ch08.aiff" \
"The working claim enters as a small machine. Not a full codec. Photonics is wave plumbing. Three test patterns: flat, edge, detail. Output port powers classify each one. A codec decides what not to store. An optical pre-codec decides what not to measure."

# CH09 — PFLIX Photonic Flicks (target: 14.6s)
say -v "$VOICE" -r $RATE -o "$DIR/ch09.aiff" \
"BEFLIX writes code for images. PFLIX writes code for waveguides. It is not a codec. It is a language. Wave creates light. Guide routes it. Split divides. Phase delays. Mix recombines. Constructive interference outputs strong. Destructive cancels. PFLIX makes light programmable."

# CH10 — PFLIX World Model (target: 15.0s)
say -v "$VOICE" -r $RATE -o "$DIR/ch10.aiff" \
"A world model loop: observe, compress, predict, act. PFLIX commands generate photonic scenes. The model compresses command-outcome relations. A prediction frame appears ahead of the present. Curiosity reward: surprise, then learnable. Compression is understanding. Predict light, then choose a new experiment."

echo ""
echo "Measuring durations..."
echo ""
printf "%s | %7s | %7s | %s\n" "CH" "AUDIO" "TARGET" "STATUS"
echo "---+--------+--------+--------"

targets=(13.6 10.0 13.2 13.7 14.3 14.0 14.9 14.8 14.6 15.0)
for i in 01 02 03 04 05 06 07 08 09 10; do
    dur=$(afinfo "$DIR/ch$i.aiff" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
    idx=$((10#$i - 1))
    target=${targets[$idx]}
    # Compare
    ok=$(python3 -c "d=$dur; t=$target; print('OK' if d <= t+1 else 'LONG' if d <= t+3 else 'CUT')")
    printf "%s | %6.1fs | %6.1fs | %s\n" "$i" "$dur" "$target" "$ok"
done

# Total
total=$(python3 -c "
import subprocess
t=0
for i in range(1,11):
    r=subprocess.run(['afinfo',f'/Users/gaia/ABC FLIX/PFLIX/audio/ch{i:02d}.aiff'],capture_output=True,text=True)
    for l in r.stdout.split('\n'):
        if 'estimated duration' in l:
            t+=float(l.split()[2])
print(f'Total audio: {t:.1f}s ({t/60:.1f}min)')
")
echo ""
echo "$total"
