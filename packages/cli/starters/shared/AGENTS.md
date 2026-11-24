# Notes for coding agents

This project makes a video with Motio: React components rendered in headless Chrome and captured frame by frame. Frames are rendered in any order, in several tabs at once, and a failed frame is retried on a fresh tab, so the pixels of a frame must depend only on its frame number and the props.

- Time comes from `useCurrentFrame()`; `useVideoConfig()` gives `fps`, size and duration. Derive every moving value from the frame, with `interpolate()` and `spring()`.
- No CSS transitions, `setTimeout`, `setInterval`, `requestAnimationFrame` loops or `Date.now()`: they run on real time and give different pixels on every render. CSS `@keyframes` animations are fine: Motio seeks them to the frame's time.
- No state kept between frames (a counter in an effect, a ref, a module cache). Use `random(seed)`, not `Math.random()`.
- These rules are for the default frame time model. A library that runs on its own clock (GSAP, a canvas loop on `requestAnimationFrame`, `setInterval`, `Date`) and cannot be driven from the frame can render with `timeModel="virtual"` on its `<Composition>` (or `--time-model=virtual`): `Date`, `performance.now()`, timers, `requestAnimationFrame` and `Math.random()` then follow the frame. Renders get slower the later a tab starts, `motio dev` still runs the real clock, and network requests still need `delayRender()`.
- Anything asynchronous (fetched data, a font, a decoded file) is held with `const handle = delayRender()` and released with `continueRender(handle)`: the frame is captured once every handle is released.
- Files in `public/` are referenced with `staticFile("name.png")`.
- To show a product's UI, do not import the product's components: they bring transitions, timers and data fetching that run on real time. Rebuild the screens here and share pure data with the product instead: design tokens, copy, icons, sample records.
- Before handing over a video, run `{{exec}} motio check determinism src/index.ts <composition-id>` (exit code 3 when frames differ between runs, with the likely cause) and `{{exec}} motio check flicker src/index.ts <composition-id>`. `{{exec}} motio compositions src/index.ts` lists the ids.

Reference: `node_modules/@motiojs/motio/README.md` and the guide it links to. Every command takes `--help`, and `--json` for scripts.
