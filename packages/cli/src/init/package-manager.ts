/** Package managers `motio init` can install with. */
export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** How to spell common actions with a package manager, for the README and the next steps. */
export interface PackageManagerCommands {
	/** Installs the dependencies, e.g. `pnpm install`. */
	install: string;
	/** Runs a package.json script; append the script name, e.g. `npm run`. */
	run: string;
	/** Runs a binary of the project's dependencies, e.g. `pnpm exec`. */
	exec: string;
	/** Adds a development dependency; append the package name. */
	addDev: string;
}

const COMMANDS: Record<PackageManager, PackageManagerCommands> = {
	pnpm: { install: "pnpm install", run: "pnpm", exec: "pnpm exec", addDev: "pnpm add -D" },
	npm: { install: "npm install", run: "npm run", exec: "npx", addDev: "npm install -D" },
	yarn: { install: "yarn", run: "yarn", exec: "yarn", addDev: "yarn add -D" },
	bun: { install: "bun install", run: "bun run", exec: "bunx", addDev: "bun add -d" },
};

/** The commands of a package manager. */
export function packageManagerCommands(pm: PackageManager): PackageManagerCommands {
	return COMMANDS[pm];
}

/**
 * The package manager that started this process, read from `npm_config_user_agent` (set by
 * `pnpm create`, `npm exec`, `yarn dlx`, `bunx`...), or null when none did.
 */
export function detectPackageManager(
	env: Record<string, string | undefined>,
): PackageManager | null {
	const agent = env.npm_config_user_agent;
	if (!agent) return null;
	const name = /^([a-z]+)\//.exec(agent)?.[1];
	return (PACKAGE_MANAGERS as readonly string[]).includes(name ?? "")
		? (name as PackageManager)
		: null;
}
