---
paths:
  - "tools/oracle/**"
  - "packages/*/src/__oracle__/**"
  - "packages/testing/**"
---

- Never open, print or search files under `tools/oracle/node_modules` (Remotion's source and type declarations): call the public API only.
- Fixtures change only by running the record command, in a separate commit whose message says why.
- Every fixture records the Remotion version it came from; the version is pinned in `tools/oracle/package.json` and matches the compatibility target in `docs/ARCHITECTURE.md`.
