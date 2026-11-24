import plexMono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2";
import plexMono600 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2";
import anybody from "@fontsource-variable/anybody/files/anybody-latin-wdth-normal.woff2";
import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2";
import { loadFont } from "@motiojs/fonts";

// The brand's three typefaces (SIL OFL 1.1), from the same Fontsource packages the website
// self-hosts. Each loadFont() holds the render until its file is ready, so no frame is captured
// with a fallback font.
export const DISPLAY = "Anybody";
export const SANS = "Instrument Sans";
export const MONO = "IBM Plex Mono";

loadFont({ family: DISPLAY, url: anybody, weight: "100 900", stretch: "50% 150%" });
loadFont({ family: SANS, url: instrumentSans, weight: "400 700", stretch: "75% 100%" });
loadFont({ family: MONO, url: plexMono500, weight: 500 });
loadFont({ family: MONO, url: plexMono600, weight: 600 });
