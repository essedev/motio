/**
 * `@motiojs/starburst`, the equivalent of `@remotion/starburst`: `<Starburst>` draws the rays with
 * WebGL 2, equal to Remotion's renders. `starburst()` needs an effect pipeline Motio does not have
 * and throws; `starburstEffectSchema` is the published data.
 */
export { type StarburstEffectParams, starburst } from "./effect.js";
export { starburstEffectSchema } from "./schema.js";
export { Starburst, type StarburstProps } from "./starburst.js";
