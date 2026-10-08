---
title: "Install from source"
description: "Build and install the current unpublished package with the engine dependencies you need."
---

# Install from source

The public npm registry returned `E404` for `npm view fa-search-kit version --json` on 2026-10-08. This checkout declares version `0.0.0`. Do not rely on `npm install fa-search-kit` being available; use a locally built tarball.

## Build the package

Use Node.js 22 or newer and npm. The source tools execute TypeScript directly; validation for this documentation used Node.js 24.8.0. If an early Node 22 installation cannot run those tools, use a current Node 22 release or Node 24. The compiled package is ESM and includes TypeScript declarations.

```sh
git clone https://github.com/eramhq/fa-search-kit.git
cd fa-search-kit
npm ci
npm run build
npm pack
```

`npm run build` creates `dist/`. Run it before packing: there is no automatic prepack build. In your application directory, install the generated tarball and whichever engine you use:

```sh
npm install /absolute/path/to/fa-search-kit/fa-search-kit-0.0.0.tgz
npm install minisearch@7.2.0
```

Replace the absolute path with your clone's path and use the filename printed by `npm pack`. Set `"type": "module"` in the application's package.json or use `.mjs` files for Node examples. Do not import files from `src/` or `dist/` directly; use the public package exports.

## Optional engine dependencies

The package has no runtime dependencies. Engine peers are optional and must be installed by the application that uses them:

| Engine | Declared peer range | Version tested here |
| --- | --- | --- |
| `pagefind` | `^1.5.0` | `1.5.2` |
| `@orama/orama` | `^3.1.0` | `3.1.18` |
| `minisearch` | `^7.0.0` | `7.2.0` |
| `flexsearch` | `^0.8.0` | `0.8.212` |
| `lunr` | `^2.3.0` | `2.3.9` |

Adapters accept hooks or the engine object; they do not install engines. Pagefind browser integration imports the generated `pagefind.js` bundle, and the optional UI rescue loads that bundle by URL.

## Browser requirements

Bundle public imports as ESM with your application's bundler. The source targets ES2022 and uses Unicode property escapes, `Map`, and typed arrays. Remote rescue vocabulary loading also uses `fetch`, `Response`, `Blob`, streams, and `DecompressionStream("gzip")`. There is no declared legacy-browser support matrix. Keep Node-only `/pagefind/build` and `/rescue/build` out of browser bundles. See [browser loading](browser-loading.md).

## Website review and releases

The publishing contract supports reviewing an uncommitted working tree. The current website loader still needs the repository registration and CLI fixes described in [troubleshooting](recipes.md) before its `docs:local` workflow can display this library correctly. Public imports require a published GitHub release, including a labeled prerelease. A normal website build uses its committed documentation snapshot and does not fetch local edits or branch HEAD. No npm or GitHub release is created by these instructions.
