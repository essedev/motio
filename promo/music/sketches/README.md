# Teaser music sketches

Alternatives to `../teaser.wav`, each committed to one musical premise, to choose by ear. Same length (21.8 s, 654 frames at 30 fps), same targets (-16 LUFS integrated, about -1 dBTP), 48 kHz stereo 16-bit. They accent only three moments: the mark landing (frame 7), the speed cut and the end card (frames 359.5 and 567.5, when the incoming field covers half the frame); the tempo is fitted so that the last two fall on a beat, and the intro has no beat yet, so the mark accent is free.

Sketch A ("filter house") was chosen and refined into the teaser's music: it is `../generate.ts` now.

```sh
node promo/music/sketches/sketch-b.ts   # or sketch-c.ts; about 1 s each, byte-identical on every run
node promo/music/analyze.ts b c         # loudness, spectrum per section, accent strength per cut, PNGs
```

They share `../dsp.ts` with the teaser's generator (timeline, Motio's spring maths, filters, ladder filter, reverb, BS.1770 meter, limiter, WAV writer). Everything is synthesised; no samples or downloaded audio.

| Sketch | Premise | Tempo | Accents |
|---|---|---|---|
| B, 2-step | UK garage: skippy kick changing bar to bar, rim and clap on 2 and 4 laid back, ghost rims, shuffled hats; drawbar organ through a rotating speaker playing Fm9, Dbmaj9, Bbm9, C7#9; sine sub with glide. | 129.8 BPM, 60% swing | Mark: one held organ chord. Speed: the C7#9 bar ends in a beat with no kick or sub, then Fm9. End: three beats of swung rim fill over C7#9, an empty sixteenth, Fm11 with the rotor slowing. |
| C, minimal | One note (A) as a looping FM bass motif whose brightness drifts; dry short kick; clicks, rim clicks and woodblocks from modal synthesis; tape hiss, crackle, wow and flutter, saturation. | 121.2 BPM, 55% swing | Mark: three woodblocks, one per frame of the mark. Speed: a bar without kick, then the kick returns with a voice a fifth up. End: a beat and a half of silence, then one hit with a sagging note. |

Measured (FFmpeg `ebur128`): B -16.0 LUFS, -1.8 dBTP (it reaches the loudness without touching the limiter), speed +23.4 dB at frame 359.62, end card +16.3 dB at frame 567.50; C -16.0 LUFS, -1.0 dBTP, speed +27.4 dB at frame 359.68, end card +46.1 dB at frame 567.68.

`sketch-keys.ts` and `analyze-keys.ts` are the first soundtrack (F major, keys and bells, accents on every cut), kept as an alternative: see `../README.md`.

Licence: composed and synthesised for Motio with the code in this directory; Apache-2.0 like the rest of the repository.
