import { staticFile } from "remotion";
import "./global.css";
import logo from "./logo.svg";
import pixel from "./pixel.png";
import styles from "./styles.module.css";

const greeting: string = process.env.REMOTION_GREETING ?? "missing";

export const Root = () => (
	<div className={styles.card} data-greeting={greeting} data-dotenv={process.env.FROM_DOTENV}>
		<img alt="logo" src={logo} />
		<img alt="pixel" src={pixel} />
		<span>{staticFile("data/a b#c.txt")}</span>
	</div>
);
