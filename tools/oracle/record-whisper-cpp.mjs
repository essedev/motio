// Records what the published @remotion/install-whisper-cpp does on this machine, black-box:
// installWhisperCpp() (the git and make commands it runs, seen through logging wrappers put first
// on PATH), downloadWhisperModel() (the URL it fetches), and transcribe() on whisper.cpp's
// samples/jfk.wav (a public-domain recording shipped with whisper.cpp) with tiny.en: the arguments
// the executable receives (through a logging wrapper in its place), the JSON it resolves to, the
// progress values and the failures. Paths are written as <whisperPath>, <input>, <output>, <cwd>,
// <work> (the cache folder).
// Writes packages/install-whisper-cpp/src/__oracle__/transcribe.json and
// tools/oracle/fixtures/jfk-transcription.json.
// Usage: pnpm record:whisper-cpp (clones and builds whisper.cpp 1.5.5, downloads 75 MB once).
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { downloadWhisperModel, installWhisperCpp, transcribe } from "@remotion/install-whisper-cpp";

const here = import.meta.dirname;
const root = join(here, "../..");
const VERSION = "1.5.5";
const MODEL = "tiny.en";
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies[
	"@remotion/install-whisper-cpp"
];
const work = join(homedir(), ".cache/motio/oracle-whisper-cpp");
const whisperPath = join(work, `whisper.cpp-${VERSION}`);
const log = join(work, "commands.log");
mkdirSync(work, { recursive: true });
writeFileSync(log, "");

// Logging wrappers for the commands installWhisperCpp() runs.
const shims = join(work, "shims");
mkdirSync(shims, { recursive: true });
for (const command of ["git", "make", "cmake"]) {
	let real;
	try {
		real = execFileSync("which", [command], { encoding: "utf8" }).trim();
	} catch {
		continue;
	}
	writeFileSync(
		join(shims, command),
		`#!/bin/sh\necho "${command} $*" >> "${log}"\nexec "${real}" "$@"\n`,
	);
	chmodSync(join(shims, command), 0o755);
}
const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
	fetched.push(String(url));
	return realFetch(url, init);
};

const placeholders = (text) =>
	text
		.replaceAll(join(whisperPath, "samples/jfk.wav"), "<input>")
		.replaceAll(whisperPath, "<whisperPath>")
		.replaceAll(work, "<work>")
		.replaceAll(join(process.cwd(), "tmp"), "<output>")
		.replaceAll(process.cwd(), "<cwd>");

rmSync(whisperPath, { recursive: true, force: true });
const path = process.env.PATH;
process.env.PATH = `${shims}:${path}`;
const install = await installWhisperCpp({ to: whisperPath, version: VERSION, printOutput: false });
const installAgain = await installWhisperCpp({
	to: whisperPath,
	version: VERSION,
	printOutput: false,
});
process.env.PATH = path;
const installCommands = readFileSync(log, "utf8")
	.split("\n")
	.filter((line) => line !== "" && !line.includes("cmTC_"))
	.map(placeholders);
const model = await downloadWhisperModel({ model: MODEL, folder: whisperPath, printOutput: false });
const modelAgain = await downloadWhisperModel({
	model: MODEL,
	folder: whisperPath,
	printOutput: false,
});

// A logging wrapper in place of the executable.
const executable = join(whisperPath, "main");
renameSync(executable, `${executable}.real`);
const argsLog = join(work, "args.log");
writeFileSync(
	executable,
	`#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a" >> "${argsLog}"; done\nprintf '\\n\\0' >> "${argsLog}"\nexec "$0.real" "$@"\n`,
);
chmodSync(executable, 0o755);

const input = join(whisperPath, "samples/jfk.wav");
const notWav = join(work, "jfk.bin");
const at44k = join(work, "jfk-44k.wav");
copyFileSync(input, notWav);
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", input, "-ar", "44100", at44k]);

const base = {
	inputPath: input,
	whisperPath,
	whisperCppVersion: VERSION,
	model: MODEL,
	printOutput: false,
};
const cases = [
	{},
	{ tokenLevelTimestamps: true },
	{ tokenLevelTimestamps: false, tokensPerItem: null },
	{ tokenLevelTimestamps: false, tokensPerItem: 0 },
	{ tokenLevelTimestamps: false, tokensPerItem: 5 },
	{ tokenLevelTimestamps: true, tokensPerItem: 3 },
	{ translateToEnglish: true },
	{ tokenLevelTimestamps: true, translateToEnglish: true, language: "auto" },
	{ tokenLevelTimestamps: true, splitOnWord: true, language: "en" },
	{ language: "Haitian Creole" },
	{ splitOnWord: false, flashAttention: false },
	{ additionalArgs: [["-t", "2"], "-ng"] },
	{ modelFolder: whisperPath },
	{ inputPath: "/nonexistent.wav" },
	{ inputPath: notWav },
	{ inputPath: at44k },
	{ model: "base" },
	{ modelFolder: "/nonexistent" },
];
const results = [];
let jfk = null;
for (const options of cases) {
	writeFileSync(argsLog, "");
	const progress = [];
	const entry = { options: JSON.parse(placeholders(JSON.stringify(options))) };
	try {
		const result = await transcribe({ ...base, ...options, onProgress: (p) => progress.push(p) });
		result.params.model = placeholders(result.params.model);
		delete result.systeminfo;
		entry.result = result;
		entry.progress = {
			first: progress[0] ?? null,
			last: progress.at(-1) ?? null,
			count: progress.length,
		};
		if (options.tokenLevelTimestamps && Object.keys(options).length === 1) jfk = result;
	} catch (error) {
		entry.error = placeholders(String(error?.message ?? error)).split("\n")[0];
		entry.errorType = error instanceof TypeError ? "TypeError" : "Error";
	}
	const raw = readFileSync(argsLog, "utf8");
	entry.args =
		raw === ""
			? null
			: raw
					.split("\0")
					.filter((a) => a !== "" && a !== "\n")
					.map(placeholders);
	results.push(entry);
	console.log(JSON.stringify(entry.options), entry.error ?? "ok");
}
renameSync(`${executable}.real`, executable);

const outDir = join(root, "packages/install-whisper-cpp/src/__oracle__");
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "transcribe.json"),
	`${JSON.stringify(
		{
			package: "@remotion/install-whisper-cpp",
			version,
			whisperCppVersion: VERSION,
			model: MODEL,
			description:
				"installWhisperCpp() commands (through PATH wrappers) and results, downloadWhisperModel() URL and results, and transcribe() on whisper.cpp's samples/jfk.wav: executable arguments, resolved JSON (systeminfo removed), progress, failures. Recorded on macOS arm64.",
			install: { result: install, again: installAgain, commands: installCommands },
			modelDownload: { result: model, again: modelAgain, urls: fetched },
			cases: results,
		},
		null,
		"\t",
	)}\n`,
);
// The token-level transcription feeds record-transcription.mjs (toCaptions() over real output).
if (jfk) {
	writeFileSync(
		join(here, "fixtures/jfk-transcription.json"),
		`${JSON.stringify([jfk], null, "\t")}\n`,
	);
}
console.log("transcribe.json recorded");
