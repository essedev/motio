import { type EnableTailwind, makeEnableTailwind } from "./tailwind.js";

/** Replacement for `enableTailwind` from `@remotion/tailwind-v4` (Tailwind 4, `@tailwindcss/vite`). */
export const enableTailwind: EnableTailwind = makeEnableTailwind("v4");
