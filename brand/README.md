# Motio brand kit

The brand is Kinetic, with the Flipbook mark (D-077): three frames fanned out, the way a thumb fans the pages of a flipbook. The full direction, with the landing and docs pages it shapes, is `docs/concepts/concept-c-kinetic.html`.

Every file here is generated from one geometry, `website/src/brand/mark.ts`, by `make brand` (it also writes the site's icons and Open Graph card). Edit the geometry, not the SVGs.

## Files

| File | Use |
|---|---|
| `motio-lockup.svg` | Primary lockup: colour mark, Plum wordmark. Light backgrounds. |
| `motio-lockup-on-dark.svg` | Colour mark, Mist wordmark. Dark backgrounds. |
| `motio-lockup-ink.svg` | Monochrome Plum, for light backgrounds and colour fields. |
| `motio-lockup-mist.svg` | Monochrome Mist, for dark backgrounds and photos. |
| `motio-mark.svg` | Mark alone, colour. |
| `motio-mark-ink.svg`, `motio-mark-mist.svg` | Mark alone, monochrome. |
| `motio-mark-animated.svg` | The mark playing once on load: frames scale in, then fan out with the brand spring. Shows the resting frame with reduced motion. |
| `favicon/` | `favicon.svg`, `favicon.ico` (16, 32, 48), PNG favicons, `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png` on a Plum field, and their source `app-icon.svg`. |

The gaps between the frames are transparent (SVG masks), so every file works on any background. The wordmark is outlined: no font is needed to display it.

On the website the logo is the component `website/src/components/Logo.astro`: the same geometry, animated with CSS whose easings are Motio's own `spring()` sampled at 30 fps into `linear()`. It plays once on load in the landing's navigation and replays on hover or keyboard focus.

## Palette

Three saturated colours, always as flat fields that meet edge to edge. No gradients, no glows, no shadows: colour changes at an edge, like a cut between two shots.

| Name | Hex | Role |
|---|---|---|
| Paper | `#FFFFFF` | Light theme ground, docs, long reading. |
| Plum | `#2A0E2E` | Ink: text, code blocks, the player screen. Never replaced by a near-black. |
| Night | `#1C0B1F` | Dark theme ground. |
| Mist | `#F6EFF4` | Text on Plum and Night. |
| Pulse | `#FF3D8B` | Primary field: actions, the playhead, the current frame, the front frame of the mark. |
| Spark | `#FFDD3C` | Second field: badges, highlights, the middle frame. |
| Drift | `#12B5A5` | Third field: sequences, the second data series, the back frame. |

Rules:

- **Text on any colour field is Plum.** Plum on Pulse is 5.2:1, on Drift 6.8:1, on Spark 13:1. White or Mist on them fails AA.
- **Fields keep their colour in both themes.** Only the ground and the ink swap (Paper and Plum, Night and Mist).
- Muted text: `#6D5770` on light grounds (6.5:1 on Paper), `#BEA9C1` on dark ones (8.6:1 on Night).

## Type

| Role | Typeface | Notes |
|---|---|---|
| Display | Anybody (variable: weight 100 to 900, width 50 to 150) | Weights 750 to 900. Width is the kinetic gesture: headings use widths from 60 to 140, the wordmark is weight 800, width 112, tracking -0.015 em. |
| Body | Instrument Sans (variable: weight 400 to 700, width 75 to 100) | 16 to 19 px, line height 1.55 (1.7 in the docs). |
| Code | IBM Plex Mono (400, 500, 600) | Code and commands only, never for labels. |

All three are under the SIL Open Font License 1.1, which allows using, embedding and redistributing them with software, including self-hosting on a website, as long as the licence travels with the files and the fonts are not sold on their own. The site self-hosts them from the Fontsource packages (no request to Google's servers) and serves the licences next to them in `website/public/fonts/`.

## Clear space and minimum size

- **Clear space**: on every side, at least the height of the front (Pulse) frame of the mark. Nothing else, text or edge, enters it.
- **Minimum size**: the mark alone at 16 px (favicon); the lockup at 20 px of mark height, about 80 px wide. Below that, use the mark alone.
- Do not rotate, recolour (outside the palette's monochrome variants), stretch, outline or add effects to the mark. Do not change the order of the frames: Drift at the back, Spark in the middle, Pulse in front.

## Motion

- **Motion answers an action**: hover, click, drag. The only unprompted movement is one moment when a page opens: the logo, the hero title rising, the hero composition playing once.
- **Every move is a spring**, sampled per frame at 30 fps like a composition. Two configurations, nowhere else: `{ damping: 12, stiffness: 120 }` for brand moments (overshoot, settles in 26 frames) and `{ damping: 200 }` stretched to a duration for interface motion (no bounce). Hover and press feedback: 160 ms ease-out.
- **Reduced motion shows the last frame.** With `prefers-reduced-motion`, every animation is skipped and the resting frame shows at once; nothing is hidden behind an animation.
