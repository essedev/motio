import { Config } from "@remotion/cli/config";
import { registerRoot } from "remotion";

const configIsCompat = typeof Config.setCodec === "function";

registerRoot(() => (
	<p data-config={String(configIsCompat)} data-dotenv={process.env.FROM_DOTENV}>
		with config
	</p>
));
