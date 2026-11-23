import { loadFont } from "@motiojs/fonts";
import { staticFile } from "motio";

// Imported once by Root.tsx. Each loadFont() call holds the render until its file is loaded, so
// no frame is ever captured with a fallback font. A missing file fails the render.
export const fontFamily = "Inter";

loadFont({ family: fontFamily, url: staticFile("fonts/inter-400.woff2"), weight: 400 });
loadFont({ family: fontFamily, url: staticFile("fonts/inter-700.woff2"), weight: 700 });
