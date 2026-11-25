# Backlog

Open work that is not in the roadmap, by area and in no order. A milestone picks its items from here.

## Publishing

- **Rewrite the git history before the repository goes public.** Remotion's renders of its own templates were removed from the tree on 2026-11-23, in the legal hygiene round, but are still in earlier commits.
- **First npm release (0.1.0).** Everything is prepared (D-092): create `essedev/motio`, publish the pinned FFmpeg (next item), publish once with a token from a fresh clone, run `tools/release/trust.ts`, push the tag `v0.1.0`; the steps are in `CONTRIBUTING.md`. Then set `NPM_PUBLISHED` to true in `website/src/lib/repo.ts` and replace the "not on npm yet" and "try it from a clone" wording of the READMEs, the guide and the `create-motio` README. The trusted-publishing path itself (OIDC, provenance on a tarball) is first exercised by the release after 0.1.0, and the workflow's unit tests have not run on GitHub's runners yet.
- **`@motiojs/google-fonts` is 39 MB unpacked** (2.2 MB packed, 7,411 files): one module per family, each with its JavaScript, declarations and two source maps. Dropping the maps of the generated modules would halve the files; measure an install before deciding.
- **Legal review before publishing**: the product name next to Motion (motion.dev) as a trademark question (D-081), together with the GPL review above.
- **AGENTS.md for existing projects.** `motio init` writes `AGENTS.md` and `CLAUDE.md` into new projects, but a project that adds Motio with `pnpm add @motiojs/motio` gets neither, and its coding agent starts without the render rules (the doc comments of the key exports and the package README only reach it once it looks). A command such as `motio agents` would write both files from `packages/cli/starters/shared/`, so the text keeps one source and works for any agent; the `@motiojs/motio` README would mention it under "In an existing project". Preferred to a Claude Code skill, which only reaches people who install it. Do it when the packages go on npm, or earlier if an agent in an existing project gets the rules wrong despite the doc comments and the README.

## Compatibility

- **`motionBlur` on transitions.** The `motionBlur` prop of `<TransitionSeries.Transition>` is accepted with a warning and has no effect. Add it when a real project needs it (D-066).
