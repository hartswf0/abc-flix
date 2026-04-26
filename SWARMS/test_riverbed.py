import pytest
from hypothesis import given, assume, strategies as st, settings

from riverbed import (
    SourceArtifact,
    ContrastiveExample,
    compile_riverbed,
)


@settings(deadline=None)
@given(st.text(min_size=20, max_size=500))
def test_text_compile_is_total_for_nonempty_alpha_text(text):
    assume(any(c.isalpha() for c in text))

    rep = compile_riverbed(SourceArtifact(kind="text", data=text, name="fuzz-text"))

    assert rep.source_kind == "text"
    assert rep.patches
    assert len(rep.commands) == len(rep.patches)
    assert rep.source_hash
    assert rep.title


def test_breaking_contrast_promotes_missing_identity_terms():
    source = SourceArtifact(
        kind="text",
        name="riverbed-system",
        data=(
            "The riverbed keeps the hinge fixed while the current varies. "
            "The channel carries erosion and deposit through each breach."
        ),
    )

    examples = [
        ContrastiveExample(
            variation="The current varies through each breach.",
            breaks_identity=True,
            reason="riverbed and hinge removed",
        ),
        ContrastiveExample(
            variation="The riverbed keeps the hinge fixed while the stream varies.",
            breaks_identity=False,
            reason="current may rename without collapse",
        ),
    ]

    rep = compile_riverbed(source, examples)

    anchors = {h.anchor for h in rep.hinges}
    assert any("riverbed" in a or "hinge" in a for a in anchors)


def test_commands_preserve_primary_hinge_anchor():
    source = SourceArtifact(
        kind="text",
        name="mall",
        data=(
            "The sealed mall hums under fluorescent light. "
            "The black glass threshold opens into a painted void."
        ),
    )

    rep = compile_riverbed(source)

    assert rep.hinges
    primary = rep.hinges[0].anchor
    assert all(primary in command for command in rep.commands)


def test_static_image_produces_single_opsign_patch():
    source = SourceArtifact(
        kind="image",
        name="single-image",
        data={
            "description": "A cracked glass door glowing under fluorescent light with dust on the tile."
        },
    )

    rep = compile_riverbed(source)

    assert len(rep.patches) == 1
    assert rep.patches[0].image_function == "Opsign"
    assert rep.patches[0].duration_s == 8.0
    assert len(rep.commands) == 1


def test_video_segments_into_legal_patch_windows():
    source = SourceArtifact(
        kind="video",
        name="surveillance-clip",
        data={
            "duration_s": 30,
            "description": "A surveillance camera watches a corridor.",
            "events": [
                {"time_s": 4, "type": "vector", "label": "figure enters", "weight": 0.8},
                {"time_s": 11, "type": "sound", "label": "speaker hiss", "weight": 0.9},
                {"time_s": 18, "type": "threshold", "label": "door opens", "weight": 0.9},
                {"time_s": 25, "type": "scale", "label": "camera zooms", "weight": 0.7},
            ],
        },
    )

    rep = compile_riverbed(source)

    assert 3 <= len(rep.patches) <= 6
    assert len(rep.commands) == len(rep.patches)

    for i, patch in enumerate(rep.patches):
        # Last patch may be shorter due to uneven tail split
        if i < len(rep.patches) - 1:
            assert 6.0 <= patch.duration_s <= 12.0
        else:
            assert 4.0 <= patch.duration_s <= 12.0


@settings(deadline=None)
@given(
    st.lists(
        st.fixed_dictionaries({
            "time_s": st.floats(min_value=0.0, max_value=60.0, allow_nan=False, allow_infinity=False),
            "type": st.sampled_from(["vector", "sound", "threshold", "scale", "surface", "anomaly"]),
            "label": st.text(min_size=1, max_size=30),
            "weight": st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
        }),
        min_size=0,
        max_size=20,
    )
)
def test_video_compiler_is_deterministic(events):
    source = SourceArtifact(
        kind="video",
        name="fuzz-video",
        data={
            "duration_s": 60,
            "description": "A fixed camera watches a space.",
            "events": events,
        },
    )

    rep1 = compile_riverbed(source)
    rep2 = compile_riverbed(source)

    assert rep1.to_json() == rep2.to_json()


def test_collector_captures_anomaly_events():
    source = SourceArtifact(
        kind="video",
        name="anomaly-video",
        data={
            "duration_s": 20,
            "description": "A corridor with broken light.",
            "events": [
                {"time_s": 9, "type": "anomaly", "label": "impossible shadow", "weight": 1.0},
            ],
        },
    )

    rep = compile_riverbed(source)

    assert any(item.kind == "visual-anomaly" for item in rep.collector)
    assert any("impossible shadow" in item.signal for item in rep.collector)


def test_warnings_expose_weak_identity_when_no_hinges():
    source = SourceArtifact(kind="text", name="empty", data="")

    rep = compile_riverbed(source)

    assert any("No hinges" in warning for warning in rep.warnings)
