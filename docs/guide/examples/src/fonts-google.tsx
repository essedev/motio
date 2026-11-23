import { loadFont } from "@motiojs/google-fonts/Inter";

// Downloads from Google Fonts when the page loads; only the weights and subsets you name.
const { fontFamily } = loadFont("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const Body = () => <p style={{ fontFamily }}>Text in Inter</p>;
