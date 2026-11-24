# /// script
# requires-python = ">=3.12"
# dependencies = ["wasmtime==50.0.1", "numpy>=2"]
# ///
"""Renders the teaser stems with piezo's own engine: promo/music/stems/<part>.wav.

Each instrument is a piezo patch (patches/<part>.json, exported from the saved "motio teaser"
patches) played with its note sequence from score.json, exactly as piezo renders a moment:
the same engine.wasm the browser and the backend run, through the engine's Python binding,
from a fresh engine at time 0, at 48 kHz. Only the piezo repository is read, never written.

Run: uv run promo/music/piezo/render_stems.py [part ...]
Needs the piezo repository for the engine's Python binding (PIEZO_REPO, default
~/Development/Projects/piezo) and an engine.wasm: PIEZO_WASM, default the repository's
engine/build/engine.wasm. The stems in this directory were rendered with the binary served by
synth.esse.dev (sha256 47e73f8e...), the same one render_patch reports.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import wave
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True  # never leave __pycache__ inside the piezo repository
PIEZO = Path(os.environ.get("PIEZO_REPO", Path.home() / "Development/Projects/piezo"))
sys.path.insert(0, str(PIEZO / "engine/bindings/python"))
from piezo_engine import PiezoEngine  # noqa: E402

HERE = Path(__file__).resolve().parent
STEMS = HERE.parent / "stems"
SR = 48_000


def write_wav(path: Path, left: np.ndarray, right: np.ndarray) -> None:
    """32-bit float WAV, so the mix gets the engine's samples untouched."""
    data = np.stack([left, right], axis=1).astype("<f4").tobytes()
    with path.open("wb") as f:
        f.write(b"RIFF")
        f.write((4 + 26 + 8 + len(data)).to_bytes(4, "little"))
        f.write(b"WAVEfmt ")
        f.write((18).to_bytes(4, "little"))
        f.write((3).to_bytes(2, "little"))  # IEEE float
        f.write((2).to_bytes(2, "little"))
        f.write(SR.to_bytes(4, "little"))
        f.write((SR * 8).to_bytes(4, "little"))
        f.write((8).to_bytes(2, "little"))
        f.write((32).to_bytes(2, "little"))
        f.write((0).to_bytes(2, "little"))
        f.write(b"data")
        f.write(len(data).to_bytes(4, "little"))
        f.write(data)


def main() -> None:
    score = json.loads((HERE / "score.json").read_text())
    wasm = Path(os.environ.get("PIEZO_WASM", PIEZO / "engine/build/engine.wasm"))
    engine = PiezoEngine(wasm, SR)
    print(f"engine {wasm} sha256 {hashlib.sha256(wasm.read_bytes()).hexdigest()[:16]}")
    STEMS.mkdir(exist_ok=True)
    wanted = sys.argv[1:] or sorted(score["parts"])
    for part in wanted:
        patch = json.loads((HERE / "patches" / f"{part}.json").read_text())
        # JSON writes 1.0 as 1, and the binding passes velocity to the engine as is: wasmtime
        # accepts only a float for an f32 argument.
        notes = [{**n, "velocity": float(n["velocity"])} for n in score["parts"][part]]
        left, right = engine.render_moment(patch, notes, score["duration_s"])
        lch = np.frombuffer(left, dtype=np.float32)
        rch = np.frombuffer(right, dtype=np.float32)
        peak = float(max(np.abs(lch).max(), np.abs(rch).max()))
        rms = float(np.sqrt((lch.astype(np.float64) ** 2 + rch.astype(np.float64) ** 2).mean() / 2))
        write_wav(STEMS / f"{part}.wav", lch, rch)
        print(
            f"{part:8} {len(notes):4} notes  peak {20 * np.log10(peak + 1e-12):6.1f} dBFS  "
            f"rms {20 * np.log10(rms + 1e-12):6.1f} dBFS"
        )


if __name__ == "__main__":
    main()
