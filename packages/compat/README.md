# @motiojs/compat

The Remotion compatibility layer of [Motio](https://motio.esse.dev): a Vite plugin that resolves `remotion` and `@remotion/*` imports to the Motio packages that replace them, the replacement for `@remotion/cli/config`, and the manifest of every Remotion symbol with its status in Motio. `@motiojs/bundler` applies the plugin to every build, so a project rarely installs or imports this package itself.

## What it provides

| Export | Role |
|---|---|
| `motioCompat()` | The Vite plugin: `remotion` resolves to `@motiojs/motio/remotion`, `@remotion/<name>` (with subpaths) to its Motio package, `@remotion/cli/config` to `@motiojs/compat/config`. Importing a package Motio does not provide fails the build with the package, the imported symbols and what to use instead. Options: `symbols` (`"warn"`, the default, `"error"` or `"off"` for symbols the manifest lists as missing), `aliases`, `manifest`. |
| `@motiojs/compat/config` | The `Config` object that `remotion.config.ts` imports. The commands read its setters and say which have no effect. |
| `@motiojs/compat/tailwind`, `@motiojs/compat/tailwind-v4` | Replacements for `enableTailwind` of `@remotion/tailwind` (Tailwind 3) and `@remotion/tailwind-v4` (Tailwind 4): the override marks the configuration and the bundler enables Tailwind in its Vite build. |
| `@motiojs/compat/manifest.json` | Every symbol of the supported Remotion modules with its status: `supported`, `approximated` (works, with a documented difference), `stubbed` (accepted, does nothing or fails with a message) or `missing`. |
| `mapSpecifier()`, `scanProject()`, `createCompatibilityReport()` | The functions behind `motio doctor`, which lists every Remotion symbol a project imports with its status. |

```bash
pnpm exec motio doctor
```

## Compatibility

The compatibility target is pinned at the Remotion 4.0.545 API, checked by tests against recordings of that release.

Documentation: [motio.esse.dev/reference/packages/compat](https://motio.esse.dev/reference/packages/compat/) · Guide: [Coming from Remotion](https://motio.esse.dev/guide/coming-from-remotion/) · Source: [packages/compat](https://github.com/essedev/motio/tree/main/packages/compat)
