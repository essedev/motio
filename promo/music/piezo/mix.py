# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Mixes the piezo stems into promo/music/teaser-piezo.wav: 48 kHz, stereo, 16-bit, 19.8 s.

Everything runs in FFmpeg: a fixed balance (each stem is measured with ebur128 and brought to
its level relative to the kick), sidechain ducking of the tonal parts from the kick, the same
master EQ as the code-synth version, gentle bus compression, a limiter at 4x oversampling so the
true peak stays near -1 dBTP, a fade to silence from 19.0 s (silent from 19.68 s, frame 590),
and TPDF dither to 16-bit. The master gain is searched so integrated loudness lands on -16 LUFS.

Run: uv run promo/music/piezo/mix.py (after render_stems.py). Needs ffmpeg on the PATH.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEMS = HERE.parent / "stems"
OUT = HERE.parent / "teaser-piezo.wav"
SR = 48_000
SAMPLES = 950_400  # 19.8 s, 594 frames at 30 fps
TARGET_LUFS = -16.0

# Level of each stem relative to the kick, in LU, measured as the stem's own integrated loudness.
BALANCE = {
    "kick": 0.0,
    "bass": -1.5,
    "pad": -7.0,
    "keys": -5.0,
    "pluck": -5.0,
    "bell": -9.0,
    "clap": -7.0,
    "snare": -6.5,
    "hat": -12.0,
    "impact": -2.0,
    "whoosh": -8.0,
    "riser": -7.0,
}
# The chords duck under the kick. The bass stays out: it plays off the beat, and when a chord
# change puts its root on a cut, its recovery from the duck would read as a late accent.
DUCKED = ["keys", "pad", "pluck"]
REFERENCE_LUFS = -22.0  # where the kick sits before the master gain
# -4 dB until 1.2 s, back to 0 dB by 1.6 s (smooth, so the held pad does not click).
INTRO_RIDE = "volume='0.63+0.37*clip((t-1.2)/0.4,0,1)':eval=frame"


def ffmpeg(*args: str) -> str:
    run = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", *args], capture_output=True, text=True
    )
    if run.returncode != 0:
        raise RuntimeError(run.stderr[-2000:])
    return run.stderr


def loudness(path: Path) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBTP) of a file, from FFmpeg's ebur128."""
    report = ffmpeg("-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-")
    summary = report[report.rfind("Summary:") :]
    lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return lufs, peak


def graph(gains: dict[str, float], master_db: float) -> str:
    names = list(BALANCE)
    parts = [f"[{i}:a]volume={gains[n]:.3f}dB[{n}_in]" for i, n in enumerate(names)]
    for n in names:
        # The intro stays quieter than the groove: the pad and bells come up 4 dB into the first cut.
        ride = INTRO_RIDE if n in ("pad", "bell") else "anull"
        parts.append(f"[{n}_in]{ride}[{n}]")
    parts.append("[kick]asplit=2[kick_mix][kick_sc]")
    ducked = "".join(f"[{n}]" for n in DUCKED)
    parts.append(f"{ducked}amix=inputs={len(DUCKED)}:normalize=0[tonal]")
    parts.append(
        "[tonal][kick_sc]sidechaincompress=threshold=0.05:ratio=2:attack=8:release=220:"
        "makeup=1:knee=6[tonal_ducked]"
    )
    rest = [n for n in names if n not in DUCKED and n != "kick"]
    sources = "[kick_mix][tonal_ducked]" + "".join(f"[{n}]" for n in rest)
    parts.append(f"{sources}amix=inputs={2 + len(rest)}:normalize=0[sum]")
    master = ",".join(
        [
            # Master EQ, as in generate.ts: no sub rumble, less mud, a touch of presence, no harshness.
            "highpass=f=38:poles=2",
            "highpass=f=38:poles=2",
            "lowshelf=f=90:g=-3:t=q:w=0.7",
            "equalizer=f=220:t=q:w=0.9:g=-1.5",
            "equalizer=f=3000:t=q:w=0.7:g=1",
            "highshelf=f=6000:g=-3:t=q:w=0.7",
            "lowpass=f=15000:poles=2",
            # Glue: 2:1 above -20 dBFS, slow enough to keep the transients.
            "acompressor=threshold=0.1:ratio=2:attack=10:release=150:knee=3:makeup=1",
            f"volume={master_db:.3f}dB",
            # Limiter at 4x the rate, so it also catches peaks between samples.
            "aresample=192000",
            "alimiter=limit=0.88:attack=1:release=60:level=disabled",
            "aresample=48000",
            # The end: the tail decays, then a raised-cosine fade to silence by 19.68 s.
            "afade=t=out:st=19.0:d=0.68:curve=hsin",
            f"apad=whole_len={SAMPLES}",
            f"atrim=end_sample={SAMPLES}",
            "aresample=osf=s16:dither_method=triangular",
        ]
    )
    parts.append(f"[sum]{master}[out]")
    return ";".join(parts)


def render(gains: dict[str, float], master_db: float) -> None:
    inputs: list[str] = []
    for n in BALANCE:
        inputs += ["-i", str(STEMS / f"{n}.wav")]
    ffmpeg(
        "-y",
        *inputs,
        "-filter_complex",
        graph(gains, master_db),
        "-map",
        "[out]",
        "-ar",
        str(SR),
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        str(OUT),
    )


def main() -> None:
    gains = {}
    for n, rel in BALANCE.items():
        lufs, _ = loudness(STEMS / f"{n}.wav")
        gains[n] = REFERENCE_LUFS + rel - lufs
        print(f"{n:8} stem {lufs:6.1f} LUFS -> gain {gains[n]:+6.1f} dB")
    master_db = 0.0
    for _ in range(6):
        render(gains, master_db)
        lufs, peak = loudness(OUT)
        print(f"master {master_db:+6.2f} dB -> {lufs:.2f} LUFS, true peak {peak:.2f} dBTP")
        if abs(lufs - TARGET_LUFS) <= 0.1:
            break
        master_db += TARGET_LUFS - lufs
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
