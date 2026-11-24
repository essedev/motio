import { loadFont } from "@motiojs/fonts";
import { staticFile } from "@motiojs/motio";

// public/fonts/brand.woff2. The render waits until the file has loaded; a missing file fails it.
loadFont({ family: "Brand", url: staticFile("fonts/brand.woff2"), weight: 700 });

export const Title = () => <h1 style={{ fontFamily: "Brand", fontWeight: 700 }}>Hello</h1>;
