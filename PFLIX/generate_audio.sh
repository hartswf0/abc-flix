#!/bin/bash
# PFLIX voiceover — optimized ~280 words total at 130 WPM
VOICE="Samantha"
RATE=130
DIR="/Users/gaia/ABC FLIX/PFLIX/audio"
mkdir -p "$DIR"

echo "Generating PFLIX voiceover (130 WPM, ~280 words total)..."

say -v "$VOICE" -r $RATE -o "$DIR/ch01.aiff" \
"Raw video floods the machine. The pipeline tessellates frames, predicting motion to store only residual error. Frequency transforms and quantization compress data, leaving plausible motion for the eye."

say -v "$VOICE" -r $RATE -o "$DIR/ch02.aiff" \
"An open call converts curiosity into action. Through seventy-two hours of pressure, PhotonForge and FlexAgent translate raw ideas into simulated microscopic geometry."

say -v "$VOICE" -r $RATE -o "$DIR/ch03.aiff" \
"Video and photonic light present a unified problem. Both decompose into computable units. Mathematical models align hardware constraints, bridging the control of captured and designed light."

say -v "$VOICE" -r $RATE -o "$DIR/ch04.aiff" \
"Entering the PhotonCodec, pixels become optical amplitudes. Mach-Zehnder interference separates structure from detail. Light performs the first act of compression before software even touches the signal."

say -v "$VOICE" -r $RATE -o "$DIR/ch05.aiff" \
"BEFLIX provides historical computer animation. Flat fields and hard edges. The photonic transform separates this structure from detail, allowing a modern engine to reconstruct the frame."

say -v "$VOICE" -r $RATE -o "$DIR/ch06.aiff" \
"The grand claim collapses into a sanity check. BEFLIX is a test signal, not a codec target. The honest kernel emerges: a foundational optical raster decomposer."

say -v "$VOICE" -r $RATE -o "$DIR/ch07.aiff" \
"Standard codecs compress after measurement. This optical pre-codec moves work upstream, classifying flat fields and edges before digitization. It is a theory of what not to measure."

say -v "$VOICE" -r $RATE -o "$DIR/ch08.aiff" \
"Photonics is wave plumbing. Using BEFLIX as a test world, AI bridges theory to simulation. A normal codec decides what not to store. This decides what not to measure."

say -v "$VOICE" -r $RATE -o "$DIR/ch09.aiff" \
"PFLIX is not a codec. It is a language. Waveguides route, split, and mix light. A beginner-facing grammar, PFLIX makes light wave interference visible, programmable, and legible."

say -v "$VOICE" -r $RATE -o "$DIR/ch10.aiff" \
"The stack forms a world model loop: observe, compress, predict, act. A latent vector predicts the next photonic experiment. Compression is understanding. Predict light, then choose."

echo ""
echo "Converting to M4A..."
for i in 01 02 03 04 05 06 07 08 09 10; do
    afconvert -d aac -f m4af "$DIR/ch$i.aiff" "$DIR/ch$i.m4a"
done

echo ""
echo "TIMING REPORT:"
echo ""
printf "%-4s | %7s | %7s\n" "CH" "AUDIO" "TARGET"
echo "-----+---------+--------"
targets=(13.6 10.0 13.2 13.7 14.3 14.0 14.9 14.8 14.6 15.0)
total=0
for i in 01 02 03 04 05 06 07 08 09 10; do
    dur=$(afinfo "$DIR/ch$i.m4a" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
    idx=$((10#$i - 1))
    target=${targets[$idx]}
    total=$(python3 -c "print($total + $dur)")
    printf "%-4s | %6.1fs | %6.1fs\n" "$i" "$dur" "$target"
done
echo "-----+---------+--------"
echo "TOTAL: ${total}s ($(python3 -c "print(f'{$total/60:.1f}')") min)"

# Clean up AIFF
rm -f "$DIR"/*.aiff
