from __future__ import annotations

from dataclasses import dataclass, asdict, field, replace
from typing import Any, Iterable, Literal
import math
import re
import hashlib
import json


SourceKind = Literal["text", "image", "video"]
ImageFunction = Literal[
    "Opsign",
    "Sonsign",
    "Perception-Image",
    "Action-Image",
    "Affection-Image",
    "Crystal-Image",
]


STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
    "these", "those", "with", "without", "within", "from", "into", "onto", "over",
    "under", "through", "between", "across", "near", "for", "of", "to", "in", "on",
    "by", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its",
    "they", "them", "their", "we", "our", "you", "your", "i", "me", "my", "he",
    "she", "his", "her", "not", "no", "yes", "do", "does", "did", "can", "could",
    "should", "would", "will", "shall", "may", "might", "must", "have", "has",
    "had", "there", "here", "also", "just", "very", "more", "less", "only",
}

MOTION_WORDS = {
    "move", "moves", "moving", "flow", "flows", "drift", "drifts", "roll",
    "rolls", "spin", "spins", "fall", "falls", "rise", "rises", "cross",
    "crosses", "descend", "descends", "ascend", "ascends", "slide", "slides",
    "crawl", "crawls", "walk", "walks", "run", "runs", "turn", "turns",
}

SOUND_WORDS = {
    "sound", "noise", "hum", "hiss", "music", "voice", "whisper", "silence",
    "static", "echo", "ring", "bell", "speaker", "pa", "sonic", "audio",
}

SCALE_WORDS = {
    "wide", "close", "macro", "micro", "tower", "tiny", "vast", "immense",
    "zoom", "distant", "near", "panoramic", "detail", "surface",
}

THRESHOLD_WORDS = {
    "door", "window", "gate", "threshold", "interface", "seam", "edge",
    "border", "portal", "breach", "puncture", "cut", "splice", "opening",
}

LIGHT_TEXTURE_WORDS = {
    "light", "shadow", "glow", "grain", "dust", "fog", "smoke", "wet",
    "rust", "glass", "metal", "plastic", "concrete", "tile", "water",
    "fluorescent", "halation", "texture", "surface",
}


@dataclass(frozen=True)
class SourceArtifact:
    kind: SourceKind
    data: Any
    name: str = "untitled"


@dataclass(frozen=True)
class ContrastiveExample:
    variation: str
    breaks_identity: bool
    reason: str = ""


@dataclass(frozen=True)
class Hinge:
    id: str
    label: str
    anchor: str
    evidence: tuple[str, ...]
    confidence: float
    mistake_condition: str


@dataclass(frozen=True)
class Current:
    id: str
    label: str
    variable: str
    allowed_motion: str
    boundary: str


@dataclass(frozen=True)
class Interface:
    id: str
    label: str
    trigger: str
    threshold: str
    breach_law: str


@dataclass(frozen=True)
class Patch:
    id: str
    start_s: float
    end_s: float
    summary: str
    triggers: tuple[str, ...]
    image_function: ImageFunction
    lock_anchor: str
    carryover: tuple[str, ...]
    deposit: tuple[str, ...]
    vector: str

    @property
    def duration_s(self) -> float:
        return round(self.end_s - self.start_s, 3)


@dataclass(frozen=True)
class CollectorItem:
    id: str
    kind: Literal["side-object", "broken-continuity", "sonic-anomaly", "visual-anomaly", "residue"]
    signal: str
    source_patch_id: str | None
    branch_prompt: str


@dataclass(frozen=True)
class RiverbedRepresentation:
    title: str
    source_kind: SourceKind
    source_hash: str
    hinges: tuple[Hinge, ...]
    currents: tuple[Current, ...]
    interfaces: tuple[Interface, ...]
    patches: tuple[Patch, ...]
    commands: tuple[str, ...]
    collector: tuple[CollectorItem, ...]
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


def compile_riverbed(
    source: SourceArtifact,
    contrastive_examples: Iterable[ContrastiveExample] | None = None,
    max_hinges: int = 8,
    target_patch_s: float = 8.0,
) -> RiverbedRepresentation:
    """
    Compile source into riverbed-plus-flow representation.

    Pure function:
    - no file IO
    - no video decoding
    - no network access
    - deterministic output for same input
    """

    examples = tuple(contrastive_examples or ())
    source_text = source_to_text(source)
    source_hash = stable_hash({"kind": source.kind, "data": source.data, "examples": [asdict(e) for e in examples]})

    hinges = extract_hinges(source_text, examples, max_hinges=max_hinges)
    currents = extract_currents(source_text, hinges)
    interfaces = extract_interfaces(source_text)

    patches = segment_patches(
        source=source,
        source_text=source_text,
        hinges=hinges,
        target_patch_s=target_patch_s,
    )

    commands = encode_golden_record(
        hinges=hinges,
        currents=currents,
        interfaces=interfaces,
        patches=patches,
    )

    collector = collect_branches(
        source=source,
        source_text=source_text,
        hinges=hinges,
        currents=currents,
        patches=patches,
        contrastive_examples=examples,
    )

    rep = RiverbedRepresentation(
        title=f"Riverbed compile: {source.name}",
        source_kind=source.kind,
        source_hash=source_hash,
        hinges=hinges,
        currents=currents,
        interfaces=interfaces,
        patches=patches,
        commands=commands,
        collector=collector,
        warnings=(),
    )

    warnings = validate_representation(rep)
    return replace(rep, warnings=tuple(warnings))


def source_to_text(source: SourceArtifact) -> str:
    if isinstance(source.data, str):
        return source.data

    if isinstance(source.data, dict):
        chunks: list[str] = []
        for key in ("title", "description", "caption", "transcript", "notes"):
            value = source.data.get(key)
            if value:
                chunks.append(str(value))

        events = source.data.get("events", [])
        for event in events:
            if isinstance(event, dict):
                label = event.get("label", "")
                kind = event.get("type", "")
                note = event.get("note", "")
                chunks.append(f"{kind} {label} {note}")

        return "\n".join(chunks).strip()

    return str(source.data)


def extract_hinges(
    source_text: str,
    contrastive_examples: Iterable[ContrastiveExample] = (),
    max_hinges: int = 8,
) -> tuple[Hinge, ...]:
    """
    Identify standing-fast conditions.

    Rule:
    - Terms frequent in the source get base weight.
    - Terms missing from identity-breaking variations get strong hinge weight.
    - Terms missing from non-breaking variations lose hinge weight.
    """

    source_terms = weighted_terms(source_text)
    if not source_terms:
        return ()

    scores = dict(source_terms)
    evidence: dict[str, list[str]] = {term: [f"source frequency={score}"] for term, score in source_terms.items()}

    for ex in contrastive_examples:
        variation_terms = set(weighted_terms(ex.variation).keys())
        for term in source_terms:
            missing = term not in variation_terms
            if ex.breaks_identity and missing:
                scores[term] = scores.get(term, 0.0) + 3.0
                evidence[term].append(f"missing in identity-breaking variation: {ex.reason or ex.variation[:80]}")
            elif not ex.breaks_identity and missing:
                scores[term] = scores.get(term, 0.0) - 1.75
                evidence[term].append(f"allowed to vary in non-breaking variation: {ex.reason or ex.variation[:80]}")

    phrases = phrase_candidates(source_text)
    for phrase in phrases:
        words = tokenize(phrase)
        if not words:
            continue
        phrase_score = sum(scores.get(w, 0.0) for w in words) / max(1, len(words))
        if phrase_score > 1.5:
            key = phrase.lower()
            scores[key] = phrase_score + 1.0
            evidence[key] = [f"compound phrase candidate: {phrase}"]

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    selected: list[Hinge] = []

    for i, (term, score) in enumerate(ranked):
        if len(selected) >= max_hinges:
            break
        if score <= 0:
            continue
        if any(term in h.anchor or h.anchor in term for h in selected):
            continue

        confidence = clamp(score / 8.0, 0.15, 0.98)
        selected.append(
            Hinge(
                id=f"H{i + 1:02d}",
                label=f"standing-fast:{term}",
                anchor=term,
                evidence=tuple(evidence.get(term, ["source recurrence"])),
                confidence=confidence,
                mistake_condition=f"If '{term}' can be removed without breaking recognizability, demote it to flow.",
            )
        )

    return tuple(selected)


def extract_currents(source_text: str, hinges: Iterable[Hinge], max_currents: int = 12) -> tuple[Current, ...]:
    hinge_terms = {h.anchor for h in hinges}
    terms = weighted_terms(source_text)
    currents: list[Current] = []

    for term, _score in sorted(terms.items(), key=lambda kv: (-kv[1], kv[0])):
        if len(currents) >= max_currents:
            break
        if term in hinge_terms:
            continue
        if any(term in h or h in term for h in hinge_terms):
            continue

        allowed_motion = classify_allowed_motion(term)
        currents.append(
            Current(
                id=f"C{len(currents) + 1:02d}",
                label=f"flow-variable:{term}",
                variable=term,
                allowed_motion=allowed_motion,
                boundary=f"May vary only while preserving hinges: {', '.join(sorted(list(hinge_terms))[:4])}.",
            )
        )

    return tuple(currents)


def extract_interfaces(source_text: str) -> tuple[Interface, ...]:
    terms = set(tokenize(source_text))
    interfaces: list[Interface] = []

    interface_rules = [
        ("threshold seam", THRESHOLD_WORDS, "BREACH only when a surface, gate, seam, cut, or boundary is named."),
        ("scale seam", SCALE_WORDS, "TRANSLATE scale without cutting material continuity."),
        ("sonic seam", SOUND_WORDS, "CARRY OVER sound before changing visible regime."),
        ("motion seam", MOTION_WORDS, "FLOW vector first; let the camera inherit movement before transformation."),
        ("surface seam", LIGHT_TEXTURE_WORDS, "DEPOSIT texture residue after every transition."),
    ]

    for label, vocab, law in interface_rules:
        hits = sorted(terms.intersection(vocab))
        if hits:
            interfaces.append(
                Interface(
                    id=f"I{len(interfaces) + 1:02d}",
                    label=label,
                    trigger=", ".join(hits[:6]),
                    threshold=hits[0],
                    breach_law=law,
                )
            )

    if not interfaces:
        interfaces.append(
            Interface(
                id="I01",
                label="implicit continuity seam",
                trigger="no explicit seam detected",
                threshold="continuity",
                breach_law="Do not cut; preserve identity through LOCK and CARRY OVER.",
            )
        )

    return tuple(interfaces)


def segment_patches(
    source: SourceArtifact,
    source_text: str,
    hinges: Iterable[Hinge],
    target_patch_s: float = 8.0,
) -> tuple[Patch, ...]:
    if source.kind == "image":
        return segment_image(source, source_text, hinges)

    if source.kind == "video":
        return segment_video(source, source_text, hinges, target_patch_s=target_patch_s)

    return segment_text(source_text, hinges, target_patch_s=target_patch_s)


def segment_image(
    source: SourceArtifact,
    source_text: str,
    hinges: Iterable[Hinge],
) -> tuple[Patch, ...]:
    anchor = best_anchor(hinges, fallback="image-plane")
    carry = extract_carryover(source_text)
    deposit = extract_deposit(source_text, fallback=("static optical residue",))

    return (
        Patch(
            id="P01",
            start_s=0.0,
            end_s=8.0,
            summary=shorten(source_text or "single static image", 160),
            triggers=("static_source", "opsign_hold", "no_cut"),
            image_function="Opsign",
            lock_anchor=anchor,
            carryover=carry,
            deposit=deposit,
            vector="hold; inspect; let surface become event",
        ),
    )


def segment_text(
    source_text: str,
    hinges: Iterable[Hinge],
    target_patch_s: float = 8.0,
) -> tuple[Patch, ...]:
    sentences = split_sentences(source_text)
    if not sentences:
        sentences = [source_text or "empty source"]

    patches: list[Patch] = []
    buffer: list[str] = []
    elapsed = 0.0
    patch_start = 0.0

    for sentence in sentences:
        buffer.append(sentence)
        estimated = estimate_text_duration(" ".join(buffer))

        if estimated >= 6.0 or len(buffer) >= 2:
            patch_end = patch_start + clamp(estimated, 6.0, 12.0)
            patches.append(make_text_patch(
                idx=len(patches) + 1,
                start=patch_start,
                end=patch_end,
                text=" ".join(buffer),
                hinges=hinges,
            ))
            patch_start = patch_end
            elapsed = patch_end
            buffer = []

    if buffer:
        patch_end = patch_start + clamp(estimate_text_duration(" ".join(buffer)), 6.0, 12.0)
        patches.append(make_text_patch(
            idx=len(patches) + 1,
            start=patch_start,
            end=patch_end,
            text=" ".join(buffer),
            hinges=hinges,
        ))

    return tuple(patches)


def segment_video(
    source: SourceArtifact,
    source_text: str,
    hinges: Iterable[Hinge],
    target_patch_s: float = 8.0,
) -> tuple[Patch, ...]:
    data = source.data if isinstance(source.data, dict) else {}
    duration = float(data.get("duration_s") or data.get("duration_seconds") or estimate_video_duration(data, source_text))
    events = normalize_events(data.get("events", []))

    breakpoints = [0.0, duration]

    for ev in events:
        if ev["weight"] >= 0.5 or ev["type"] in {"location", "scale", "vector", "sound", "threshold", "anomaly"}:
            t = clamp(float(ev["time_s"]), 0.0, duration)
            if 0.25 < t < duration - 0.25:
                breakpoints.append(t)

    breakpoints = enforce_patch_bounds(
        sorted(set(round(x, 3) for x in breakpoints)),
        duration=duration,
        min_s=6.0,
        max_s=12.0,
        target_s=target_patch_s,
    )

    patches: list[Patch] = []
    for i, (start, end) in enumerate(zip(breakpoints, breakpoints[1:]), start=1):
        local_events = [ev for ev in events if start <= ev["time_s"] < end]
        event_words = " ".join(f"{ev['type']} {ev['label']} {ev.get('note', '')}" for ev in local_events).strip()
        patch_text = event_words or source_text or f"video interval {start:.1f}-{end:.1f}"

        triggers = tuple(sorted({ev["type"] for ev in local_events})) or ("duration_window", "perception_hold")
        carry = extract_carryover(patch_text)
        deposit = extract_deposit(patch_text, fallback=(f"residue from {start:.1f}-{end:.1f}s",))

        patches.append(
            Patch(
                id=f"P{i:02d}",
                start_s=round(start, 3),
                end_s=round(end, 3),
                summary=shorten(patch_text, 160),
                triggers=triggers,
                image_function=assign_image_function(patch_text, triggers, source_kind="video"),
                lock_anchor=best_anchor(hinges, fallback="surveillance-plane"),
                carryover=carry,
                deposit=deposit,
                vector=infer_vector(patch_text, triggers),
            )
        )

    return tuple(patches)


def make_text_patch(
    idx: int,
    start: float,
    end: float,
    text: str,
    hinges: Iterable[Hinge],
) -> Patch:
    triggers = infer_triggers(text)
    return Patch(
        id=f"P{idx:02d}",
        start_s=round(start, 3),
        end_s=round(end, 3),
        summary=shorten(text, 180),
        triggers=triggers,
        image_function=assign_image_function(text, triggers, source_kind="text"),
        lock_anchor=best_anchor(hinges, fallback="sentence-plane"),
        carryover=extract_carryover(text),
        deposit=extract_deposit(text, fallback=("semantic residue",)),
        vector=infer_vector(text, triggers),
    )


def encode_golden_record(
    hinges: Iterable[Hinge],
    currents: Iterable[Current],
    interfaces: Iterable[Interface],
    patches: Iterable[Patch],
) -> tuple[str, ...]:
    hinge_list = tuple(hinges)
    current_list = tuple(currents)
    interface_list = tuple(interfaces)

    primary_hinge = hinge_list[0].anchor if hinge_list else "source identity"
    current_terms = ", ".join(c.variable for c in current_list[:4]) or "local flow"
    commands: list[str] = []

    for patch in patches:
        interface = choose_interface_for_patch(patch, interface_list)
        carry = "; ".join(patch.carryover) or "prior texture/light/sound"
        deposit = "; ".join(patch.deposit) or "residue"
        trigger = ", ".join(patch.triggers)

        command = (
            f"{patch.id} [{patch.start_s:05.2f}-{patch.end_s:05.2f}s] "
            f"{patch.image_function}. "
            f"HINGE: {primary_hinge}. "
            f"LOCK on {patch.lock_anchor}. "
            f"FLOW through {current_terms} via vector: {patch.vector}. "
            f"BREACH {interface.label} at {interface.threshold} when trigger={trigger}. "
            f"CARRY OVER {carry}. "
            f"DEPOSIT {deposit}. "
            f"DO NOT CUT unless identity has already crossed the breach."
        )
        commands.append(command)

    return tuple(commands)


def collect_branches(
    source: SourceArtifact,
    source_text: str,
    hinges: Iterable[Hinge],
    currents: Iterable[Current],
    patches: Iterable[Patch],
    contrastive_examples: Iterable[ContrastiveExample],
) -> tuple[CollectorItem, ...]:
    items: list[CollectorItem] = []
    hinge_terms = {h.anchor for h in hinges}

    rare = rare_terms(source_text, exclude=hinge_terms, limit=6)
    for term in rare:
        items.append(
            CollectorItem(
                id=f"B{len(items) + 1:02d}",
                kind="side-object",
                signal=term,
                source_patch_id=None,
                branch_prompt=(
                    f"Collector branch: treat '{term}' as a side-object. "
                    f"Do not explain it. Let it become a future hinge only after repeated useful recurrence."
                ),
            )
        )

    for patch in patches:
        patch_text = f"{patch.summary} {' '.join(patch.triggers)}"
        if any(word in tokenize(patch_text) for word in SOUND_WORDS):
            items.append(
                CollectorItem(
                    id=f"B{len(items) + 1:02d}",
                    kind="sonic-anomaly",
                    signal=shorten(patch_text, 90),
                    source_patch_id=patch.id,
                    branch_prompt=(
                        f"Collector branch from {patch.id}: preserve sound before image. "
                        f"Let the sonic regime steer the next visual transition."
                    ),
                )
            )

        if "threshold" in patch.triggers or "anomaly" in patch.triggers:
            items.append(
                CollectorItem(
                    id=f"B{len(items) + 1:02d}",
                    kind="broken-continuity",
                    signal=shorten(patch_text, 90),
                    source_patch_id=patch.id,
                    branch_prompt=(
                        f"Collector branch from {patch.id}: the breach is not resolved. "
                        f"Generate an alternate path where the seam remains visible."
                    ),
                )
            )

    for ex in contrastive_examples:
        if ex.breaks_identity:
            missing = sorted(set(weighted_terms(source_text)) - set(weighted_terms(ex.variation)))[:3]
            if missing:
                items.append(
                    CollectorItem(
                        id=f"B{len(items) + 1:02d}",
                        kind="residue",
                        signal=", ".join(missing),
                        source_patch_id=None,
                        branch_prompt=(
                            f"Identity-break residue: {', '.join(missing)}. "
                            f"Use these as protected riverbed stones in future generations."
                        ),
                    )
                )

    if isinstance(source.data, dict):
        for ev in normalize_events(source.data.get("events", [])):
            if ev["type"] == "anomaly":
                items.append(
                    CollectorItem(
                        id=f"B{len(items) + 1:02d}",
                        kind="visual-anomaly",
                        signal=ev["label"],
                        source_patch_id=None,
                        branch_prompt=(
                            f"Video anomaly branch: '{ev['label']}' appears at {ev['time_s']:.2f}s. "
                            f"Do not smooth it away. Test whether it becomes a new transition law."
                        ),
                    )
                )

    return tuple(items)


def validate_representation(rep: RiverbedRepresentation) -> tuple[str, ...]:
    warnings: list[str] = []

    if not rep.hinges:
        warnings.append("No hinges detected. Source identity may collapse under variation.")

    if not rep.patches:
        warnings.append("No patches produced. Compiler failed to create a generative channel.")

    if len(rep.commands) != len(rep.patches):
        warnings.append("Command count does not match patch count.")

    for patch in rep.patches:
        if patch.duration_s < 6.0 and rep.source_kind != "image":
            warnings.append(f"{patch.id} is shorter than 6s; risk of jitter.")
        if patch.duration_s > 12.0:
            warnings.append(f"{patch.id} is longer than 12s; risk of under-segmentation.")
        if not patch.carryover:
            warnings.append(f"{patch.id} has no carryover; continuity may feel cut.")
        if not patch.deposit:
            warnings.append(f"{patch.id} has no deposit; transition may leave no residue.")

    return tuple(warnings)


def infer_triggers(text: str) -> tuple[str, ...]:
    terms = set(tokenize(text))
    triggers: list[str] = []

    if terms.intersection(THRESHOLD_WORDS):
        triggers.append("threshold")
    if terms.intersection(SCALE_WORDS):
        triggers.append("scale")
    if terms.intersection(MOTION_WORDS):
        triggers.append("vector")
    if terms.intersection(SOUND_WORDS):
        triggers.append("sound")
    if terms.intersection(LIGHT_TEXTURE_WORDS):
        triggers.append("surface")
    if any(w in terms for w in {"but", "yet", "however", "although"}):
        triggers.append("contradiction")

    return tuple(triggers or ["continuity"])


def assign_image_function(
    text: str,
    triggers: Iterable[str],
    source_kind: SourceKind,
) -> ImageFunction:
    trigger_set = set(triggers)
    terms = set(tokenize(text))

    if "sound" in trigger_set or terms.intersection(SOUND_WORDS):
        return "Sonsign"

    if source_kind == "video" and ("perception_hold" in trigger_set or "duration_window" in trigger_set):
        return "Perception-Image"

    if "vector" in trigger_set or terms.intersection(MOTION_WORDS):
        return "Action-Image"

    if any(w in terms for w in {"face", "hand", "breath", "body", "skin", "eye", "mouth"}):
        return "Affection-Image"

    if any(w in terms for w in {"mirror", "memory", "reflection", "archive", "dream", "past"}):
        return "Crystal-Image"

    return "Opsign"


def infer_vector(text: str, triggers: Iterable[str]) -> str:
    terms = set(tokenize(text))
    if "scale" in triggers:
        return "translate scale while preserving material inheritance"
    if "threshold" in triggers:
        return "approach seam, puncture interface, carry residue through"
    if terms.intersection({"descend", "descends", "fall", "falls"}):
        return "downward descent"
    if terms.intersection({"ascend", "ascends", "rise", "rises"}):
        return "upward ascent"
    if terms.intersection({"roll", "rolls", "spin", "spins"}):
        return "rotational roll"
    if terms.intersection(MOTION_WORDS):
        return "lateral/kinetic flow"
    return "hold with accumulating pressure"


def extract_carryover(text: str, limit: int = 4) -> tuple[str, ...]:
    terms = tokenize(text)
    selected = [t for t in terms if t in LIGHT_TEXTURE_WORDS or t in SOUND_WORDS]
    selected = stable_unique(selected)[:limit]
    if selected:
        return tuple(f"{t} continuity" for t in selected)
    return ("prior surface state",)


def extract_deposit(text: str, fallback: tuple[str, ...] = ("residue",), limit: int = 4) -> tuple[str, ...]:
    terms = tokenize(text)
    candidates = [t for t in terms if t in LIGHT_TEXTURE_WORDS or t in THRESHOLD_WORDS or t in SOUND_WORDS]
    candidates = stable_unique(candidates)[:limit]
    if candidates:
        return tuple(f"{t} residue" for t in candidates)
    return fallback


def choose_interface_for_patch(patch: Patch, interfaces: Iterable[Interface]) -> Interface:
    interface_list = tuple(interfaces)
    trigger_text = " ".join(patch.triggers).lower()

    priority = [
        ("sound", "sonic"),
        ("threshold", "threshold"),
        ("scale", "scale"),
        ("vector", "motion"),
        ("surface", "surface"),
    ]

    for trigger, label_part in priority:
        if trigger in trigger_text:
            for interface in interface_list:
                if label_part in interface.label:
                    return interface

    return interface_list[0] if interface_list else Interface(
        id="I00",
        label="implicit continuity seam",
        trigger="none",
        threshold="continuity",
        breach_law="Preserve continuity.",
    )


def best_anchor(hinges: Iterable[Hinge], fallback: str) -> str:
    hinge_list = sorted(tuple(hinges), key=lambda h: (-h.confidence, h.anchor))
    return hinge_list[0].anchor if hinge_list else fallback


def classify_allowed_motion(term: str) -> str:
    if term in MOTION_WORDS:
        return "may change vector, speed, or direction"
    if term in SOUND_WORDS:
        return "may change sonic regime if carryover is explicit"
    if term in LIGHT_TEXTURE_WORDS:
        return "may change texture, light, or surface residue"
    if term in SCALE_WORDS:
        return "may change scale through semantic zoom"
    return "may vary as local detail, never as identity condition"


def normalize_events(events: Iterable[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for ev in events:
        if not isinstance(ev, dict):
            continue

        time_s = float(ev.get("time_s", ev.get("t", 0.0)))
        ev_type = str(ev.get("type", ev.get("kind", "event"))).lower()
        label = str(ev.get("label", ev.get("name", ev_type)))
        note = str(ev.get("note", ""))
        weight = float(ev.get("weight", ev.get("confidence", 1.0)))

        normalized.append({
            "time_s": time_s,
            "type": ev_type,
            "label": label,
            "note": note,
            "weight": weight,
        })

    return sorted(normalized, key=lambda x: x["time_s"])


def enforce_patch_bounds(
    breakpoints: list[float],
    duration: float,
    min_s: float,
    max_s: float,
    target_s: float,
) -> list[float]:
    if duration <= max_s:
        return [0.0, round(duration, 3)]

    points = sorted(set([0.0, duration] + [p for p in breakpoints if 0.0 < p < duration]))

    changed = True
    while changed:
        changed = False
        new_points = [points[0]]

        i = 1
        while i < len(points):
            prev = new_points[-1]
            curr = points[i]
            gap = curr - prev

            if gap < min_s and i < len(points) - 1:
                changed = True
                i += 1
                continue

            new_points.append(curr)
            i += 1

        points = new_points

    expanded = [points[0]]
    for start, end in zip(points, points[1:]):
        gap = end - start
        if gap > max_s:
            n = max(2, math.ceil(gap / target_s))
            step = gap / n
            for k in range(1, n):
                expanded.append(round(start + k * step, 3))
        expanded.append(end)

    return sorted(set(round(p, 3) for p in expanded))


def weighted_terms(text: str) -> dict[str, float]:
    tokens = tokenize(text)
    counts: dict[str, float] = {}

    for token in tokens:
        if token in STOPWORDS or len(token) < 3:
            continue
        counts[token] = counts.get(token, 0.0) + 1.0

    return counts


def phrase_candidates(text: str, limit: int = 20) -> tuple[str, ...]:
    clean = re.sub(r"[^A-Za-z0-9\s\-]", " ", text)
    words = [w.strip() for w in clean.split() if w.strip()]
    phrases: list[str] = []

    for n in (3, 2):
        for i in range(0, max(0, len(words) - n + 1)):
            chunk = words[i:i+n]
            low = [w.lower() for w in chunk]
            if any(w in STOPWORDS for w in low):
                continue
            if sum(len(w) >= 4 for w in low) < n:
                continue
            phrases.append(" ".join(chunk))

    return tuple(stable_unique(phrases)[:limit])


def rare_terms(text: str, exclude: set[str], limit: int = 6) -> tuple[str, ...]:
    terms = weighted_terms(text)
    candidates = [
        term for term, count in terms.items()
        if count == 1 and term not in exclude and len(term) >= 5
    ]
    candidates = sorted(candidates, key=lambda x: (-weirdness_score(x), x))
    return tuple(candidates[:limit])


def weirdness_score(term: str) -> float:
    score = 0.0
    if "-" in term:
        score += 2.0
    if len(term) > 9:
        score += 1.5
    if re.search(r"(zz|xx|q|glyph|ghost|slop|hiss|seam)", term):
        score += 2.0
    return score + len(set(term)) / 10.0


def tokenize(text: str) -> list[str]:
    return [
        t.lower()
        for t in re.findall(r"[A-Za-z0-9][A-Za-z0-9\-']*", text)
        if t.strip()
    ]


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def estimate_text_duration(text: str) -> float:
    words = max(1, len(tokenize(text)))
    return clamp(words / 2.4, 4.0, 12.0)


def estimate_video_duration(data: dict[str, Any], source_text: str) -> float:
    events = normalize_events(data.get("events", []))
    if events:
        return max(8.0, events[-1]["time_s"] + 4.0)
    return 30.0 if source_text else 8.0


def stable_unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def stable_hash(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def shorten(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    return text[: max(0, n - 1)].rstrip() + "\u2026"


def clamp(x: float, low: float, high: float) -> float:
    return max(low, min(high, x))


def demo() -> None:
    source = SourceArtifact(
        kind="text",
        name="sealed mall landscape",
        data=(
            "The sealed mall hums under fluorescent light. "
            "Children cross the Atrium Commons while the fountain leaves sweet mineral residue. "
            "A black glass door marks the threshold to the outside void. "
            "The PA system hisses, then the crowd drifts toward the Sears Wastes."
        ),
    )

    examples = [
        ContrastiveExample(
            variation="The open desert market hums under daylight.",
            breaks_identity=True,
            reason="sealed mall identity removed",
        ),
        ContrastiveExample(
            variation="The sealed mall hums under dim blue light.",
            breaks_identity=False,
            reason="light color may vary",
        ),
    ]

    rep = compile_riverbed(source, examples)
    print(rep.to_json(indent=2))


if __name__ == "__main__":
    demo()
