/**
 * `@motiojs/light-leaks`, the equivalent of `@remotion/light-leaks`. `<LightLeak>` has the
 * published props, markup and timing, but draws Motio's own pattern: Remotion's shader is not
 * documented, so its pixels differ (the manifest marks it approximated). `lightLeak()` needs an
 * effect pipeline Motio does not have and throws; `lightLeakEffectSchema` is the published data.
 */
export { type LightLeakEffectParams, lightLeak } from "./effect.js";
export { LightLeak, type LightLeakProps } from "./light-leak.js";
export { lightLeakEffectSchema } from "./schema.js";
