import { loadFont } from "@motiojs/fonts";
import { AbsoluteFill, Img } from "@motiojs/motio";
// region: imports
import font from "./brand.woff2"; // a URL
import styles from "./card.module.css"; // the class names: { card: "..." }
import logo from "./logo.svg"; // a URL
import notes from "./notes.md?raw"; // the text of the file

// endregion

loadFont({ family: "Brand", url: font });

export const Card = () => (
	<AbsoluteFill className={styles.card} style={{ fontFamily: "Brand" }}>
		<Img src={logo} />
		<p>{notes}</p>
	</AbsoluteFill>
);
