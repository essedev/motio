import { type EnableTailwind, makeEnableTailwind } from "./tailwind.js";

/** Replacement for `enableTailwind` from `@remotion/tailwind` (Tailwind 3, PostCSS). */
export const enableTailwind: EnableTailwind = makeEnableTailwind("v3");
