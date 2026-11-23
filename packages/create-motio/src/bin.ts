#!/usr/bin/env node
import { defaultDeps } from "@motiojs/cli";
import { createMotio } from "./index.js";

process.exitCode = await createMotio(
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
