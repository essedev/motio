# Backlog

Open work that is not in the roadmap, by area and in no order. A milestone picks its items from here.

## Publishing

- **AGENTS.md for existing projects.** `motio init` writes `AGENTS.md` and `CLAUDE.md` into new projects, but a project that adds Motio with `pnpm add @motiojs/motio` gets neither, and its coding agent starts without the render rules (the doc comments of the key exports and the package README only reach it once it looks). A command such as `motio agents` would write both files from `packages/cli/starters/shared/`, so the text keeps one source and works for any agent; the `@motiojs/motio` README would mention it under "In an existing project". Preferred to a Claude Code skill, which only reaches people who install it. Do it when the packages go on npm, or earlier if an agent in an existing project gets the rules wrong despite the doc comments and the README.
