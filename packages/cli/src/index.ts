export { type FlagSpec, type FlagSpecs, Flags, type ParsedArgs, parseCommandArgs } from "./args.js";
export type { BundlerApi, CliDeps, CommandContext, CommandResult } from "./context.js";
export { type ErrorJson, EXIT, exitCodeFor, toErrorJson } from "./errors.js";
export {
	compareRuns,
	type DeterminismMismatch,
	type FlickerFrame,
	type FlickerOptions,
	hashPixels,
	isFlicker,
	meanAbsoluteDifference,
} from "./frames/compare.js";
export { type CliIo, Reporter } from "./io.js";
export { COMMANDS, defaultDeps, runCli } from "./main.js";
export { codecFromOutput, parseConcurrency, parseFrameRange, parseProps } from "./options.js";
export { loadRenderer, type RendererApi, type VideoConfig } from "./renderer-api.js";
