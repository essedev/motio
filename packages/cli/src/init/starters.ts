import { fileURLToPath } from "node:url";

/** A command of a starter's package.json scripts: a composition and where it renders to. */
interface StarterOutput {
	composition: string;
	output: string;
	/** Frame of a still; omitted for frame 0 or a `<Still>`. */
	frame?: number;
}

/** A project template of `motio init`, stored in `packages/cli/starters/<name>/`. */
export interface Starter {
	name: string;
	/** One line, shown in the prompt and in `--help`. */
	description: string;
	/** Motio packages the project depends on besides `motio` and `@motiojs/cli`. */
	packages: readonly string[];
	render: StarterOutput;
	still: StarterOutput;
}

/** Every starter, in prompt order. */
export const STARTERS: readonly Starter[] = [
	{
		name: "basic",
		description: "A short title animation: spring, interpolate, Series, an image, a font, a still.",
		packages: ["@motiojs/fonts"],
		render: { composition: "Intro", output: "out/intro.mp4" },
		still: { composition: "Thumbnail", output: "out/thumbnail.png" },
	},
	{
		name: "blank",
		description: "One composition and nothing else.",
		packages: [],
		render: { composition: "Main", output: "out/main.mp4" },
		still: { composition: "Main", output: "out/main.png" },
	},
	{
		name: "captions",
		description: "Word-by-word captions from a JSON transcript, with @motiojs/captions.",
		packages: ["@motiojs/captions"],
		render: { composition: "Captions", output: "out/captions.mp4" },
		still: { composition: "Captions", output: "out/captions.png", frame: 30 },
	},
];

/** The starter `motio init` picks when none is given. */
export const DEFAULT_STARTER = "basic";

/** Directory holding the starters, next to `src/` and `dist/` in the package. */
export const STARTERS_DIR = fileURLToPath(new URL("../../starters/", import.meta.url));

/** Files every starter gets, from `starters/shared/`. */
export const SHARED_DIR = "shared";

export function findStarter(name: string): Starter | undefined {
	return STARTERS.find((starter) => starter.name === name);
}
