# Teaser music sketches

Three alternatives to `../teaser.wav`, each committed to one musical premise, to choose by ear. Same length (19.8 s, 594 frames at 30 fps), same cut frames, same targets (-16 LUFS integrated, about -1 dBTP), 48 kHz stereo 16-bit. Each one accents only three moments: the mark landing (frame 7), the speed cut (frame 358.09) and the end card (frame 506.09); the tempo is fitted so that the last two fall on a beat, and the intro has no beat yet, so the mark accent is free.

```sh
node promo/music/sketches/sketch-a.ts   # or -b, -c; about 1 s each, byte-identical on every run
node promo/music/sketches/analyze.ts    # loudness, spectrum per section, accent strength per cut, PNGs
```

`dsp.ts` holds the shared code (timeline, filters, ladder filter, reverb, BS.1770 meter, limiter, WAV writer). Everything is synthesised; no samples or downloaded audio.

| Sketch | Premise | Tempo | Accents |
|---|---|---|---|
| A, filter house | Chopped detuned-saw chord loop in D Dorian (Dm9, G9) through one resonant ladder filter that opens over the piece, pumped by the kick; rubbery resonant bass with glide; metallic open hats, loose clap flams, swung shaker. | 121.6 BPM, 54% swing | Mark: a filter "wah" on one chord. Speed: one beat with no kick or bass, then the filter snaps open. End: two-beat break with the filter closing, then one open chord. |
| B, 2-step | UK garage: skippy kick changing bar to bar, rim and clap on 2 and 4 laid back, ghost rims, shuffled hats; drawbar organ through a rotating speaker playing Fm9, Dbmaj9, Bbm9, C7#9; sine sub with glide. | 133.8 BPM, 60% swing | Mark: one held organ chord. Speed: the C7#9 bar ends in a beat with no kick or sub, then Fm9. End: three beats of swung rim fill over C7#9, an empty sixteenth, Fm11 with the rotor slowing. |
| C, minimal | One note (A) as a looping FM bass motif whose brightness drifts; dry short kick; clicks, rim clicks and woodblocks from modal synthesis; tape hiss, crackle, wow and flutter, saturation. | 121.6 BPM, 55% swing | Mark: three woodblocks, one per frame of the mark. Speed: a bar without kick, then the kick returns with a voice a fifth up. End: a beat and a half of silence, then one hit with a sagging note. |

Licence: composed and synthesised for Motio with the code in this directory; Apache-2.0 like the rest of the repository.
