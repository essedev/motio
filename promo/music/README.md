# Teaser music

`teaser.wav` is the soundtrack of the `teaser` and `teaser-vertical` compositions (`src/teaser/Teaser.tsx` plays it with `<Audio>`): 19.8 s (594 frames at 30 fps), 48 kHz, stereo, 16-bit PCM. It is synthesised from scratch by `generate.ts` with the code in `dsp.ts` (oscillators, a ladder filter, seeded noise, a reverb, a compressor, a limiter and a BS.1770 loudness meter). No samples, loops or downloaded audio are involved.

## Generate and check

The WAV is not in git. `render.ts` (so `make promo`), `pnpm --dir promo dev`, `pnpm --dir promo still` and the promo integration test run `ensure.ts` first, which regenerates it when it is missing or when `generate.ts` or `dsp.ts` changed (it keeps their hash in `teaser.wav.sha256`). Generating takes about a second and gives the same bytes on every run (fixed seed).

```sh
node promo/music/ensure.ts     # generate teaser.wav if missing or stale
node promo/music/generate.ts   # generate it unconditionally
node promo/music/analyze.ts    # loudness, spectrum per section, accent strength per cut, the ending, a spectrogram PNG
```

They need Node 24 or later (TypeScript runs without a build step) and no dependencies; `analyze.ts` also needs `ffmpeg` on the `PATH`. `analyze.ts b c` checks the sketches below.

`dsp.ts` mirrors the teaser's timeline (`SCENES` and the 16-frame transitions of `Teaser.tsx`) and Motio's spring maths (`packages/core/src/spring.ts`) to place the accents. The integration test fails if the composition's length or frame rate differs from the generator's, or if Motio's `spring()` does not reach 50% at the frame the generator uses.

## Structure

"Filter house" in D Dorian at 121.6 BPM, sixteenths swung at 54%: a chopped chord loop of five detuned saws per note (Dm9 and G9, a bar each: the i-IV vamp) through one resonant ladder low-pass that opens over the piece and pumps under the kick; a rubbery resonant bass with glide and a pitch blip on each attack; metallic open hats (six square waves at drum-machine ratios), claps with loose flams, a swung shaker. Timing and velocity are humanised (hats and shaker about 3 ms, claps 2 ms, the loop sits 6 ms behind the beat like a chopped sample).

Only three moments are accented, the ones that matter on screen. A cut's moment is when the incoming field covers half the frame: Motio's calm spring stretched to 16 frames reaches 50% after 3.50 frames. The tempo puts ten beats between the speed cut and the end card, so both fall on a beat; the intro has no beat yet, so the mark's accent is free.

| Time (s) | Frame | Music |
|---|---|---|
| 0.233 | 7 | **Mark**: the front frame of the mark lands. One Dm9 chord, the filter blooms to about 3.8 kHz and closes over 0.7 s (a "wah"), a soft bass note. |
| 1.13 | 34 | The loop fades in under the closed filter (380 Hz). |
| 2.12 | 64 | Kick, bass and a quiet shaker. The filter starts opening towards 2 kHz. |
| 4.09 | 123 | Open hats. |
| 6.06 | 182 | Claps on 2 and 4, the shaker at full level. |
| 11.49 | 345 | One beat with no kick, bass or clap; the filter dips to 420 Hz. |
| 11.983 | 359.5 | **Speed cut**: the filter snaps to 6.5 kHz and settles around 3.3 kHz, the voicing gains a ninth on top, the bass climbs an octave on the third note of each bar. |
| 15.93 | 478 | Two-beat break: the drums stop, the filter closes with more resonance, the loop sinks back, the bass slides down. |
| 16.917 | 507.5 | **End card**: kick, the open Dm9 with its root, the bass; the filter closes over the decay and nothing else plays. |
| 19.44 | 583 | Below -60 dBFS; silent from 19.68 s (frame 590). |

## Measured

FFmpeg 8.1 (`ebur128`, `astats`) on `teaser.wav`, from `analyze.ts`:

- Integrated loudness -16.0 LUFS, loudness range 2.5 LU, true peak -1.0 dBTP, sample peak -1.0 dBFS. No full-scale samples, DC offset 0.00001, first and last samples 0.
- Per section, integrated: intro -15.8, pitch -16.2, code -15.7, reasons -15.8, speed -15.3, install -17.2, end card -20.7 LUFS.
- Accents (energy in the 80 ms after the moment against the 220 ms before, and the strongest 5 ms onset): speed +12.4 dB at frame 359.56, end card +17.6 dB at frame 507.53, the mark out of silence at frame 7.15. The other cuts read as an ordinary kick or less (-7 to +6 dB).
- Low end for laptop and phone speakers: a fourth-order high-pass at 35 Hz and a 3 dB low shelf at 90 Hz on the master; below 60 Hz holds about a quarter of the energy in the groove sections (the kick). Above 6 kHz stays 22 dB or more under the total; the 2 to 6 kHz band rises from -33 dB in the filtered opening to -15 dB in the speed section, as the filter opens.
- In the rendered teasers (`make promo`) the AAC track is the WAV with no offset (cross-correlation 1.000 around each accent), -16.0 LUFS and -1.0 dBTP after encoding, 19.8 s long; its onsets fall at frames 7.06, 359.56 and 507.53, while the incoming field covers 42% at frame 359 and 57% at frame 360 (507 and 508 for the end card).

## Alternatives

Kept to choose from by ear; none of them is used by the compositions. Generated files are ignored by git.

### Sketches B and C

`sketches/sketch-b.ts` ("2-step": UK garage at 133.8 BPM, 60% swing, drawbar organ through a rotating speaker on Fm9, Dbmaj9, Bbm9, C7#9, sine sub) and `sketches/sketch-c.ts` ("minimal": a one-note FM bass motif, clicks, rims and woodblocks from modal synthesis, tape hiss, wow and saturation, a beat and a half of silence before the end card). They share `dsp.ts` and accent the same three moments; `sketches/README.md` describes them. Run `node promo/music/sketches/sketch-b.ts` (or `-c`), then `node promo/music/analyze.ts b c`.

### The keys version

`sketches/sketch-keys.ts` is the first soundtrack: F major, FM electric piano, pad, plucked arpeggios, bells, and a riser, boom and crash on every cut, at 121.2 BPM. It writes `sketches/sketch-keys.wav`; `sketches/analyze-keys.ts` checks it. Its accents use an earlier, wrong port of the spring maths (the overdamped solution instead of Motio's critically damped one), so they fall about 1.4 frames (47 ms) before the half-cover moment.

### The piezo version

`teaser-piezo.wav` is the keys version (above) played on piezo, the modular synth at synth.esse.dev, instead of the oscillators in `sketches/sketch-keys.ts`: same tempo (121.2 BPM), key, sections, cut accents and end. Same format: 19.8 s, 48 kHz, stereo, 16-bit PCM.

#### Instruments

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

#### Render and mix

```sh
node promo/music/piezo/score.ts                  # the note sequences: piezo/score.json
uv run promo/music/piezo/render_stems.py         # one stem per patch: stems/<part>.wav
uv run promo/music/piezo/mix.py                  # teaser-piezo.wav
node promo/music/piezo/analyze-piezo.ts          # the checks of sketches/analyze-keys.ts, on teaser-piezo.wav
```

- `score.ts` turns the arrangement into note lists per instrument, in the format of a piezo moment (`time_s`, `note`, `velocity`, `duration_s`). Its timeline and tempo fit are copied from `sketches/sketch-keys.ts`: change both together.
- `render_stems.py` renders each patch with its notes exactly as piezo renders a moment, through piezo's own engine (`engine.wasm`) and its Python binding, from a fresh engine at time 0. It reads the piezo repository (`PIEZO_REPO`) and never writes to it. The stems here come from the binary served by synth.esse.dev (`PIEZO_WASM`, sha256 `47e73f8e...`, the engine version `render_patch` reports); the repository's own build gives the same samples for these patches. The stems are 32-bit float WAV, about 7.6 MB each.
- piezo's MCP server can render and measure a patch but returns no audio, and an MCP client cannot save moments, so the audio does not come from synth.esse.dev itself: the patches were designed and checked there (`render_patch` with a CLAP description), and rendered locally with the same engine.
- `mix.py` measures each stem (ebur128) and sets it to a fixed level relative to the kick, ducks keys, pad and pluck under the kick (FFmpeg `sidechaincompress`; the bass stays out of the duck, or its recovery on the "reasons" cut reads as a late accent), rides pad and bells 4 dB lower in the intro, applies the master EQ of `sketches/sketch-keys.ts`, a 2:1 glue compressor, a limiter at 4x the sample rate, a fade to silence from 19.0 s (silent from 19.68 s, frame 590) and TPDF dither to 16-bit. The master gain is searched until the file reads -16 LUFS.

#### Measured

FFmpeg 8.1 on `teaser-piezo.wav`, from `analyze-piezo.ts`:

- Integrated loudness -16.0 LUFS, loudness range 1.4 LU, true peak -1.1 dBTP (sample peak -1.1 dBFS). No full-scale samples, DC offset 0.00006, first and last samples 0, the last 100 ms below -90 dBFS.
- Per section, integrated: intro -21.6, pitch -16.6, code -16.0, reasons -16.1, speed -15.1, install -16.1, end card -16.5 LUFS. The arc is flatter than the code-synth version (LRA 1.4 against 2.9 LU), and the piezo hats, claps and crash put more energy between 2 and 6 kHz (about 3 to 5 dB more in the groove sections).
- Accents (low-band onset against the cut): pitch +2 ms, code +15 ms, reasons +3 ms, speed -4 ms, install +2 ms, end +11 ms. All within half a frame.
- No clicks: the largest sample step at each section boundary is in line with the local level, and below the largest step in the file.

The piezo version shares the keys version's timeline, so its accents are early by the same 1.4 frames.

## Licence

Composed and synthesised for Motio by its contributors with the code in this directory; no third-party audio is included. The scripts, and the WAV and PNG files they generate, are licensed under Apache-2.0, like the rest of Motio.
