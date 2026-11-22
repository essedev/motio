# Media oracle findings

Observed from the recordings in `__golden__/remotion/media.json` (Remotion 4.0.545). These are measurements, to be reproduced by M3.

- `OffthreadVideo` and `@remotion/media` `Video` pick the source frame by rounding down (`floor(t * sourceFps)`, with a small epsilon: 24 in 30 gives 0, 0, 1, 2, 3, 4, 4, ...). The HTML5 `Video` mostly rounds to nearest (0, 1, 2, 2, 3, ...) but is not frame-exact: 7 of 60 frames show a stale earlier frame and fractional positions round inconsistently (D-015).
- `trimBefore` and a parent `Sequence` offset shift video and audio exactly (audio-offset clicks at 0.55 s = 0.5 s offset + 0.25 s period - 0.2 s trim).
- Constant `volume` is linear and exact (0.25 and 0.5 scale the click peak by exactly 0.25 and 0.5).
- A `volume` callback is applied per frame and its values are quantised to steps of 1/255 (0.2 reads as 50/255, 0.8 as 205/255). Volume changes take effect about 1.5 frames late (from 0.7 to 2.5 frames on the ramp; a click right on the step boundary at 1.0 s still gets the old volume over its whole 1 ms). The exact rule is still to be determined black-box; Motio applies volume on time (D-014).
- Audio `playbackRate` 2 is time-stretched (pitch preserved): click spacing becomes 0.122 s instead of 0.125 s and click peaks are smeared by the stretch.
