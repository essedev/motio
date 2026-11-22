# Compatibility: @motiojs/captions

Target: `@remotion/captions@4.0.545`. Proof: the fixtures in `src/__oracle__/`, recorded by `tools/oracle-features` (`pnpm record captions`) on about 1,500 generated inputs per function, built from valid, malformed and borderline fragments.

| Export | Status | Tolerance |
|---|---|---|
| `Caption` (type) | exact | n/a |
| `parseSrt` (tolerant and `strict`) | exact | identical output and error messages |
| `parseVtt` | exact | identical output and error messages |
| `serializeSrt` | exact | identical strings |
| `createTikTokStyleCaptions` | exact | identical pages, tokens and durations |

Behaviours reproduced on purpose, because Remotion has them:

- Tolerant `parseSrt` reads each timestamp field with `parseInt`, so `00:00:01,5` is 1005 ms and a non-numeric millisecond field gives `NaN`; text after a blank line inside a cue is appended without a newline.
- `serializeSrt` floors each timestamp field separately, so negative times keep a sign in every field.
- `createTikTokStyleCaptions` treats `breakOnSilenceAfterMilliseconds: null` as 0 (a break at every word); only `undefined` disables the rule. Whitespace-only captions never become tokens or start a page.
