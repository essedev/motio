# Teaser music

`teaser.wav` is the soundtrack of the `teaser` and `teaser-vertical` compositions: 19.8 s (594 frames at 30 fps), 48 kHz, stereo, 16-bit PCM. It is synthesised from scratch by `generate.ts`, with oscillators, FM, seeded noise, filters, a reverb, a delay, a compressor and a limiter written in that file. No samples, loops or downloaded audio are involved.

## Regenerate and check

```sh
node promo/music/generate.ts   # writes teaser.wav in about 1 s; byte-identical on every run (fixed seed)
node promo/music/analyze.ts    # loudness, per-section spectrum, DC, clipping, clicks, accent timing, PNGs
```

Both need Node 24 or later (TypeScript runs without a build step) and no dependencies; `analyze.ts` also needs `ffmpeg` on the `PATH`. It writes `teaser-waveform.png` and `teaser-spectrogram.png` next to the WAV.

The scene timeline is copied from `promo/src/teaser/Teaser.tsx` into `SCENES` at the top of `generate.ts`. If the scenes or the transition length change, update it there and regenerate: the script fits the tempo again and fails if it leaves 110 to 124 BPM or misses a cut by more than 20 ms. The cut frames in `analyze.ts` are the ones `generate.ts` prints.

## Structure

One constant tempo, 121.2 BPM, fitted so that every scene cut lands on a beat. A cut's accent is placed where the incoming field covers half the frame: the transition is the calm spring stretched to 16 frames, which reaches 50% after 2.09 frames. Key: F major.

| Section | Time (s) | Frames | Music |
|---|---|---|---|
| Intro | 0.00 to 1.54 | 0 to 46 | Fmaj9 pad swell. A three-note strum as the three frames of the mark land (frames 7, 10, 13), soft ticks as the letters rise (frames 12 to 20), a riser into the first downbeat. |
| Pitch | 1.54 to 3.50 | 46 to 105 | Hit on the cut; four-on-the-floor kick, off-beat bass, a held Fmaj9 chord on FM keys. |
| Code | 3.50 to 7.97 | 105 to 239 | Full groove: claps on 2 and 4, sixteenth hats, syncopated key stabs and a pad, Am7 then Bbmaj7. A one-beat snare fill (beat 12, 7.47 s) leads into the next cut. |
| Reasons | 7.97 to 11.94 | 239 to 358 | F then Dm9, a plucked eighth-note motif through a dotted-eighth ping-pong delay, open hats. |
| Speed | 11.94 to 14.90 | 358 to 447 | The lift: brighter pad and voicing an octave up, an ascending sixteenth arpeggio that swells, a rising bell tick as each bar of the chart starts to grow (frames 370 to 385), a snare roll and riser into the next cut with one silent eighth before it. |
| Install | 14.90 to 16.87 | 447 to 506 | Sparser keys, Dm7 then C (to resolve on F), a short fill and riser into the end card. |
| End card | 16.87 to 19.80 | 506 to 594 | The final hit: kick, boom, crash and a wide F chord; the groove stops. A bell answers the "Open source." tag (frame 527). The chord and reverb decay; the last frames (from 19.68 s, frame 590) are silent. |

Accents on the cuts (boom, soft filtered crash and a whoosh that pans from the right like the slide), as measured by `analyze.ts` from the low-band onset:

| Cut | Cut frame | Onset frame | Offset |
|---|---|---|---|
| pitch | 46.09 | 46.16 | +2 ms |
| code | 105.09 | 105.55 | +15 ms |
| reasons | 239.09 | 239.53 | +15 ms |
| speed | 358.09 | 357.97 | -4 ms |
| install | 447.09 | 447.07 | 0 ms |
| end | 506.09 | 506.53 | +15 ms |

Every accent is within half a frame (16.7 ms) of its cut.

## Measured

FFmpeg 8.1 (`ebur128`, `loudnorm`, `astats`) on the generated file:

- Integrated loudness -16.0 LUFS, loudness range 2.9 LU, true peak -1.0 dBTP (sample peak -1.0 dBFS).
- No full-scale samples, DC offset 0.00001, first and last samples 0.
- Per section, integrated: intro -21.1, pitch -18.2, code -16.1, reasons -15.7, speed -14.7 (the loudest, the lift), install -16.4, end card -17.1 LUFS.
- Low end is controlled for laptop and phone speakers: a fourth-order high-pass at 38 Hz and a low shelf at 90 Hz on the master, and the bass and kick carry harmonics so they are heard on small speakers. Below 60 Hz holds about a tenth of the energy in the groove sections; above 6 kHz stays at least 18 dB under the total, with a gentle shelf and a 15 kHz low-pass against harshness.
- No clicks: every voice has a fade-in and fade-out, and the largest sample step at each section boundary is below the largest step in the file and in line with the local level (kick transients).

## The piezo version

`teaser-piezo.wav` is the same arrangement played on piezo, the modular synth at synth.esse.dev, instead of the oscillators in `generate.ts`: same tempo (121.2 BPM), key, sections, cut accents and end. Same format: 19.8 s, 48 kHz, stereo, 16-bit PCM. `teaser.wav` stays as it is; pick one by listening.

### Instruments

Twelve piezo patches, saved in the author's piezo library with the prefix "motio teaser" (exported here as `piezo/patches/<part>.json`). Each is played from its own Tastiera (keyboard); velocity drives a Valvola (amplifier) unless noted.

| Patch | Part | How it is built |
|---|---|---|
| motio teaser - kick | four-on-the-floor kick, end hit | Tamburo tuned to A1 with a pitch drop, a little Fornace drive for small speakers |
| motio teaser - clap | claps on 2 and 4 | Grandine fires three hits 10.5 ms apart into a noise Tamburo, Lente band-pass, short Grotta room |
| motio teaser - snare | fill and rolls | Tamburo at 60% noise, small Grotta room |
| motio teaser - hat | closed and open hats | noise Tamburo through a Lente high-pass and a Prisma low-pass at 13 kHz; a gate-driven Respiro makes the note length the decay (18 ms closed, 110 ms open) |
| motio teaser - bass | off-beat bass | two detuned saw Cristalli into a Prisma with an envelope on the cutoff, an Orbita sine under them, light Fornace drive |
| motio teaser - keys | chord stabs, end chord | two Orbita FM operators (2.6 cents apart) with an envelope on the FM index: an electric piano; Stormo chorus, Grotta |
| motio teaser - pad | pad under the groove and the intro swell | three detuned saw Cristalli into a Prisma; velocity opens the filter (cutoff = 600 Hz x 2^(2.5 v)), so the score sets the brightness of each section; Stormo, Grotta |
| motio teaser - pluck | motif in "reasons", arpeggio in "speed" | Orbita at ratio 2 with a fast index envelope, Valle echo at a dotted eighth (0.371 s), Stormo, Grotta |
| motio teaser - bell | mark strum, letter ticks, chart ticks, end tag | a 4 ms burst of Vento noise strikes a Campana modal resonator tuned by the keyboard; Valle, Grotta |
| motio teaser - impact | boom and soft crash on each cut | Tamburo tuned low with a 0.9 s decay, plus two Vento noises (left and right) through Lente high-passes on a long Respiro |
| motio teaser - whoosh | sweep into each cut | pink Vento through a Lente band-pass whose cutoff and level follow a 0.3 s Respiro |
| motio teaser - riser | risers into "pitch", "install" and the end card | Vento through a resonant Lente band-pass and a sine Cristallo gliding up an octave, both on one Respiro; the keyboard pitch is cabled into the Respiro's attack, so the note sets the rise time (C4 is 1 s, C5 is 2 s) |

### Render and mix

```sh
node promo/music/piezo/score.ts                  # the note sequences: piezo/score.json
uv run promo/music/piezo/render_stems.py         # one stem per patch: stems/<part>.wav
uv run promo/music/piezo/mix.py                  # teaser-piezo.wav
node promo/music/piezo/analyze-piezo.ts          # the same checks as analyze.ts, on teaser-piezo.wav
```

- `score.ts` turns the arrangement into note lists per instrument, in the format of a piezo moment (`time_s`, `note`, `velocity`, `duration_s`). Its timeline and tempo fit are copied from `generate.ts`: change both together.
- `render_stems.py` renders each patch with its notes exactly as piezo renders a moment, through piezo's own engine (`engine.wasm`) and its Python binding, from a fresh engine at time 0. It reads the piezo repository (`PIEZO_REPO`) and never writes to it. The stems here come from the binary served by synth.esse.dev (`PIEZO_WASM`, sha256 `47e73f8e...`, the engine version `render_patch` reports); the repository's own build gives the same samples for these patches. The stems are 32-bit float WAV, about 7.6 MB each.
- piezo's MCP server can render and measure a patch but returns no audio, and an MCP client cannot save moments, so the audio does not come from synth.esse.dev itself: the patches were designed and checked there (`render_patch` with a CLAP description), and rendered locally with the same engine.
- `mix.py` measures each stem (ebur128) and sets it to a fixed level relative to the kick, ducks keys, pad and pluck under the kick (FFmpeg `sidechaincompress`; the bass stays out of the duck, or its recovery on the "reasons" cut reads as a late accent), rides pad and bells 4 dB lower in the intro, applies the master EQ of `generate.ts`, a 2:1 glue compressor, a limiter at 4x the sample rate, a fade to silence from 19.0 s (silent from 19.68 s, frame 590) and TPDF dither to 16-bit. The master gain is searched until the file reads -16 LUFS.

### Measured

FFmpeg 8.1 on `teaser-piezo.wav`, from `analyze-piezo.ts`:

- Integrated loudness -16.0 LUFS, loudness range 1.4 LU, true peak -1.1 dBTP (sample peak -1.1 dBFS). No full-scale samples, DC offset 0.00006, first and last samples 0, the last 100 ms below -90 dBFS.
- Per section, integrated: intro -21.6, pitch -16.6, code -16.0, reasons -16.1, speed -15.1, install -16.1, end card -16.5 LUFS. The arc is flatter than the code-synth version (LRA 1.4 against 2.9 LU), and the piezo hats, claps and crash put more energy between 2 and 6 kHz (about 3 to 5 dB more in the groove sections).
- Accents (low-band onset against the cut): pitch +2 ms, code +15 ms, reasons +3 ms, speed -4 ms, install +2 ms, end +11 ms. All within half a frame.
- No clicks: the largest sample step at each section boundary is in line with the local level, and below the largest step in the file.

## Licence

Composed and synthesised for Motio by its contributors with the code in this directory; no third-party audio is included. The WAV, the PNGs and the scripts are part of this repository and are licensed under Apache-2.0, like the rest of Motio.
