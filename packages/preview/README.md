# @motiojs/preview

The preview page that `motio dev` serves in [Motio](https://motio.esse.dev): the project's compositions in a Player with transport controls and a loop range, a props editor, a timeline with one row per sequence, a Problems panel (failed loads, open `delayRender()` handles, page warnings) and a render check that saves stills to `out/`. React only, no UI framework.

It is an internal package: `@motiojs/bundler` depends on it to run the dev server, and projects get it through `@motiojs/cli`. Do not install it directly; start it with:

```bash
pnpm exec motio dev
```

## Compatibility

There is no Remotion package of the same name: `motio dev` is Motio's alternative to Remotion's Studio (`@remotion/studio`), a preview page built on the Player rather than an editor.

Documentation: [motio.esse.dev/reference/packages/preview](https://motio.esse.dev/reference/packages/preview/) · CLI: [motio dev](https://motio.esse.dev/reference/cli/dev/) · Source: [packages/preview](https://github.com/essedev/motio/tree/main/packages/preview)
