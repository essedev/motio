#!/usr/bin/env node
import { defaultDeps, runCli } from "./main.js";

const exitCode = await runCli(
	process.argv.slice(2),
	{
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
		cwd: process.cwd(),
		env: process.env,
		isTTY: process.stderr.isTTY === true,
	},
	defaultDeps(process.env),
);
process.exitCode = exitCode;
