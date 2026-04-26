#!/usr/bin/env python3
"""
Riverbed video harness.

Decodes a video file via OpenCV, extracts motion/luminance/shot events,
feeds them to riverbed.compile_riverbed(), prints the result.

This is the DECODER layer. It touches files and pixels.
riverbed.py stays pure.
"""

import sys
import os
import json
import math
import numpy as np
import cv2

# Add parent dir to path so we can import riverbed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from riverbed import SourceArtifact, ContrastiveExample, compile_riverbed


# ──────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────
SAMPLE_FPS = 8          # Sample at 8fps (not every frame — fast enough)
GRID_W, GRID_H = 32, 24  # Downsample to 32x24 for block analysis
MOTION_THRESH = 25.0    # Mean abs diff threshold for "significant motion"
LUMA_SHIFT_THRESH = 12.0  # Global brightness shift threshold
SHOT_THRESH = 40.0      # Very large shift = possible cut


def extract_video_events(video_path: str) -> dict:
    """
    Decode video → structured event dict suitable for riverbed.compile_riverbed.

    Returns:
        {
            "duration_s": float,
            "fps": float,
            "width": int,
            "height": int,
            "total_frames": int,
            "description": str,
            "events": [
                {"time_s": float, "type": str, "label": str, "weight": float, "note": str},
                ...
            ]
        }
    """

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_s = total_frames / fps if fps > 0 else 0

    print(f"VIDEO: {width}x{height} @ {fps:.1f}fps, {total_frames} frames, {duration_s:.2f}s")

    # Sample frames at SAMPLE_FPS
    sample_interval = max(1, int(fps / SAMPLE_FPS))
    events = []
    prev_gray_small = None
    prev_mean_luma = None
    frame_idx = 0

    # Accumulate per-region motion for tracking moving objects
    motion_accumulator = np.zeros((GRID_H, GRID_W), dtype=np.float64)
    luma_history = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval != 0:
            frame_idx += 1
            continue

        time_s = frame_idx / fps

        # Convert to grayscale and downsample
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
        mean_luma = float(np.mean(small))
        luma_history.append((time_s, mean_luma))

        if prev_gray_small is not None:
            # ── MOTION: per-block absolute difference ──
            diff = np.abs(small.astype(np.float32) - prev_gray_small.astype(np.float32))
            block_motion = np.mean(diff)
            motion_accumulator += diff

            # Global motion event
            if block_motion > MOTION_THRESH:
                # Find where the motion is concentrated
                max_block = np.unravel_index(np.argmax(diff), diff.shape)
                region_y, region_x = max_block
                quadrant = get_quadrant(region_x, region_y, GRID_W, GRID_H)

                events.append({
                    "time_s": round(time_s, 3),
                    "type": "vector",
                    "label": f"motion burst ({quadrant})",
                    "weight": round(min(1.0, block_motion / 80.0), 3),
                    "note": f"mean_diff={block_motion:.1f}, peak at grid ({region_x},{region_y})",
                })

            # ── LUMINANCE SHIFT ──
            if prev_mean_luma is not None:
                luma_delta = abs(mean_luma - prev_mean_luma)
                if luma_delta > LUMA_SHIFT_THRESH:
                    direction = "brighter" if mean_luma > prev_mean_luma else "darker"
                    events.append({
                        "time_s": round(time_s, 3),
                        "type": "surface",
                        "label": f"luminance shift ({direction})",
                        "weight": round(min(1.0, luma_delta / 40.0), 3),
                        "note": f"delta={luma_delta:.1f}, from {prev_mean_luma:.0f} to {mean_luma:.0f}",
                    })

            # ── SHOT DETECTION: very large global change = possible cut ──
            if block_motion > SHOT_THRESH:
                events.append({
                    "time_s": round(time_s, 3),
                    "type": "threshold",
                    "label": "possible cut/transition",
                    "weight": round(min(1.0, block_motion / 60.0), 3),
                    "note": f"global_diff={block_motion:.1f} exceeds shot threshold",
                })

            # ── SCALE DETECTION: check if detail distribution changed ──
            prev_std = float(np.std(prev_gray_small))
            curr_std = float(np.std(small))
            std_delta = abs(curr_std - prev_std)
            if std_delta > 15.0:
                scale_dir = "zooming in (more detail)" if curr_std > prev_std else "zooming out (less detail)"
                events.append({
                    "time_s": round(time_s, 3),
                    "type": "scale",
                    "label": scale_dir,
                    "weight": round(min(1.0, std_delta / 30.0), 3),
                    "note": f"std_delta={std_delta:.1f}",
                })

        prev_gray_small = small.copy()
        prev_mean_luma = mean_luma
        frame_idx += 1

    cap.release()

    # ── POST-PROCESSING: detect sustained stillness regions ──
    if luma_history:
        # Find stretches where luminance barely changes = opsign / loaded stillness
        window = max(3, len(luma_history) // 10)
        for i in range(0, len(luma_history) - window, window):
            chunk = luma_history[i:i+window]
            lumas = [l for _, l in chunk]
            if max(lumas) - min(lumas) < 4.0:
                events.append({
                    "time_s": round(chunk[0][0], 3),
                    "type": "event",
                    "label": "sustained stillness",
                    "weight": 0.6,
                    "note": f"luma range={max(lumas)-min(lumas):.1f} over {chunk[-1][0]-chunk[0][0]:.1f}s",
                })

    # ── DETECT SPATIAL ANOMALIES from accumulated motion ──
    if motion_accumulator.max() > 0:
        normalized = motion_accumulator / motion_accumulator.max()
        # Find cells that accumulated very little motion = static elements
        static_mask = normalized < 0.1
        static_count = int(np.sum(static_mask))
        if static_count > GRID_W * GRID_H * 0.3:
            events.append({
                "time_s": 0.0,
                "type": "event",
                "label": f"persistent static region ({static_count}/{GRID_W*GRID_H} cells)",
                "weight": 0.7,
                "note": "Possible riverbed: cells that never moved throughout the video",
            })

        # Find cells with concentrated motion = tracked object paths
        hot_mask = normalized > 0.7
        hot_count = int(np.sum(hot_mask))
        if hot_count > 0 and hot_count < GRID_W * GRID_H * 0.3:
            # Find centroid of hot region
            hot_coords = np.argwhere(hot_mask)
            cy, cx = hot_coords.mean(axis=0)
            quadrant = get_quadrant(int(cx), int(cy), GRID_W, GRID_H)
            events.append({
                "time_s": 0.0,
                "type": "anomaly",
                "label": f"motion concentration ({quadrant}, {hot_count} cells)",
                "weight": 0.8,
                "note": "Concentrated motion path — possible tracked object trajectory",
            })

    # ── DEDUPLICATE: merge events very close in time ──
    events = deduplicate_events(events, min_gap=0.3)
    events.sort(key=lambda e: e["time_s"])

    filename = os.path.basename(video_path)
    description = f"Video file: {filename}. {width}x{height} @ {fps:.0f}fps, {duration_s:.1f}s duration. {len(events)} events detected."

    return {
        "duration_s": round(duration_s, 3),
        "fps": round(fps, 2),
        "width": width,
        "height": height,
        "total_frames": total_frames,
        "description": description,
        "events": events,
    }


def get_quadrant(x: int, y: int, w: int, h: int) -> str:
    lr = "left" if x < w // 2 else "right"
    tb = "upper" if y < h // 2 else "lower"
    return f"{tb}-{lr}"


def deduplicate_events(events: list[dict], min_gap: float = 0.3) -> list[dict]:
    """Merge events of the same type within min_gap seconds."""
    if not events:
        return events

    events.sort(key=lambda e: (e["type"], e["time_s"]))
    deduped = [events[0]]

    for ev in events[1:]:
        prev = deduped[-1]
        if ev["type"] == prev["type"] and abs(ev["time_s"] - prev["time_s"]) < min_gap:
            # Keep the one with higher weight
            if ev["weight"] > prev["weight"]:
                deduped[-1] = ev
        else:
            deduped.append(ev)

    return deduped


def _json_default(obj):
    """Handle numpy types for JSON serialization."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 harness_video.py <video_path> [prompt_text]")
        sys.exit(1)

    video_path = sys.argv[1]
    prompt_text = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(video_path):
        print(f"File not found: {video_path}")
        sys.exit(1)

    print("=" * 60)
    print("RIVERBED VIDEO HARNESS")
    print("=" * 60)

    # ── STEP 1: Extract events from video ──
    print("\n[1/4] EXTRACTING VIDEO EVENTS...")
    video_data = extract_video_events(video_path)
    print(f"  → {len(video_data['events'])} events extracted")
    print(f"  → Duration: {video_data['duration_s']:.1f}s")

    # Print event summary
    event_types = {}
    for ev in video_data["events"]:
        event_types[ev["type"]] = event_types.get(ev["type"], 0) + 1
    print(f"  → Event breakdown: {dict(sorted(event_types.items()))}")

    # ── STEP 2: Build SourceArtifact ──
    print("\n[2/4] BUILDING SOURCE ARTIFACT...")
    name = os.path.splitext(os.path.basename(video_path))[0][:60]

    # If prompt is provided, add it to the description
    if prompt_text:
        video_data["description"] = prompt_text + "\n\n" + video_data["description"]
        video_data["transcript"] = prompt_text

    source = SourceArtifact(
        kind="video",
        name=name,
        data=video_data,
    )

    # ── STEP 3: Build contrastive examples from the prompt ──
    print("\n[3/4] COMPILING RIVERBED...")
    examples = []
    if prompt_text:
        # Auto-generate contrastive examples from the prompt
        examples = [
            ContrastiveExample(
                variation="A standard corporate video shot on digital camera with clean cuts.",
                breaks_identity=True,
                reason="no Panavision grain, no continuous take, cuts break identity",
            ),
            ContrastiveExample(
                variation="The same continuous-take through the same industrial threshold with different lighting.",
                breaks_identity=False,
                reason="lighting may vary; spatial continuity preserved",
            ),
        ]

    rep = compile_riverbed(source, examples)

    # ── STEP 4: Output ──
    print("\n[4/4] RESULTS")
    print("=" * 60)
    print(f"TITLE:   {rep.title}")
    print(f"HASH:    {rep.source_hash}")
    print(f"HINGES:  {len(rep.hinges)}")
    print(f"CURRENTS: {len(rep.currents)}")
    print(f"INTERFACES: {len(rep.interfaces)}")
    print(f"PATCHES: {len(rep.patches)}")
    print(f"COMMANDS: {len(rep.commands)}")
    print(f"COLLECTOR: {len(rep.collector)}")
    print(f"WARNINGS: {len(rep.warnings)}")

    print("\n─── HINGES (what stands fast) ───")
    for h in rep.hinges:
        print(f"  {h.id} [{h.confidence:.2f}] {h.anchor}")
        for e in h.evidence[:2]:
            print(f"       ← {e[:80]}")

    print("\n─── CURRENTS (what may flow) ───")
    for c in rep.currents[:8]:
        print(f"  {c.id} {c.variable}: {c.allowed_motion}")

    print("\n─── INTERFACES (breach points) ───")
    for iface in rep.interfaces:
        print(f"  {iface.id} {iface.label} → trigger: {iface.trigger}")

    print("\n─── PATCHES (temporal segments) ───")
    for p in rep.patches:
        print(f"  {p.id} [{p.start_s:05.1f}-{p.end_s:05.1f}s] {p.image_function} | {p.vector[:50]}")
        print(f"       triggers: {', '.join(p.triggers)}")
        print(f"       carryover: {', '.join(p.carryover[:2])}")

    print("\n─── GOLDEN RECORD COMMANDS ───")
    for cmd in rep.commands:
        print(f"  {cmd[:120]}...")

    print("\n─── COLLECTOR (side objects / anomalies) ───")
    for item in rep.collector[:8]:
        print(f"  {item.id} [{item.kind}] {item.signal[:60]}")

    if rep.warnings:
        print("\n─── WARNINGS ───")
        for w in rep.warnings:
            print(f"  ⚠ {w}")

    # ── Save JSON — include raw events for the viewer ──
    out_dir = os.path.dirname(video_path) or "."
    out_path = os.path.join(out_dir, "riverbed-compile.json")
    output = rep.to_dict()
    output["_events"] = video_data["events"]  # raw events for timeline visualization
    output["_video"] = {
        "duration_s": video_data["duration_s"],
        "fps": video_data["fps"],
        "width": video_data["width"],
        "height": video_data["height"],
    }
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=_json_default)

    file_size = os.path.getsize(out_path)
    print(f"\n{'=' * 60}")
    print(f"SAVED: {out_path} ({file_size/1024:.1f} KB)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
