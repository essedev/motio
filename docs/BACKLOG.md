# Backlog

Open work that is not in the roadmap, by area and in no order. A milestone picks its items from here.

## Publishing

- **Rewrite the git history before the repository goes public.** Remotion's renders of its own templates were removed from the tree on 2026-11-23, in the legal hygiene round, but are still in earlier commits.
- **Publish the pinned FFmpeg.** The archives are built and verified locally; the author's steps are in D-065 (create the repository, set the release owner, run the `ffmpeg-build` workflow, update the manifest digests, publish the release, then the package), with a short legal review of the GPL setup before the last step. Then reword the `E_FFMPEG_NOT_FOUND` hint and the "coming soon" in the guide, `doctor` and the READMEs (D-083).
- **Website placeholders.** `REPO_OWNER`, `SITE_URL` and `NPM_PUBLISHED` in the site wait for the repository and the npm release (D-079, D-083); the guide's clone URL uses the same placeholder owner. No deploy, hosting or analytics yet.
- **Legal review before publishing**: the product name next to Motion (motion.dev) as a trademark question (D-081), together with the GPL review above.
- **AGENTS.md for existing projects.** `motio init` writes `AGENTS.md` and `CLAUDE.md` into new projects, but a project that adds Motio with `pnpm add @motiojs/motio` gets neither, and its coding agent starts without the render rules (the doc comments of the key exports and the package README only reach it once it looks). A command such as `motio agents` would write both files from `packages/cli/starters/shared/`, so the text keeps one source and works for any agent; the `@motiojs/motio` README would mention it under "In an existing project". Preferred to a Claude Code skill, which only reaches people who install it. Do it when the packages go on npm, or earlier if an agent in an existing project gets the rules wrong despite the doc comments and the README.

## Compatibility

- **`motionBlur` on transitions.** The `motionBlur` prop of `<TransitionSeries.Transition>` is accepted with a warning and has no effect. Add it when a real project needs it (D-066).
