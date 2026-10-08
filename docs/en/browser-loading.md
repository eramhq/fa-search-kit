---
title: "Load browser features on demand"
description: "Separate core analysis, lexicon data, rescue, and build-time tooling in browser applications."
---

# Load browser features on demand

Import the adapter you need. The root export does not re-export adapters, the lexicon, or rescue. For a Persian search dialog, you can defer the full analyzer until the visitor opens search:

```js browser
let analyzerPromise;
export function loadPersianAnalyzer() {
  return analyzerPromise ??= Promise.all([
    import("fa-search-kit"), import("fa-search-kit/lexicon"),
  ]).then(([{ createAnalyzer }, { lexicon }]) =>
    createAnalyzer({ profile: "full", lexicon, verbs: "lemma" })
  ).catch(error => { analyzerPromise = undefined; throw error; });
}
export async function loadOptionalRescue() {
  const [analyzer, { createRescue, fetchWords }] = await Promise.all([
    loadPersianAnalyzer(), import("fa-search-kit/rescue"),
  ]);
  return { analyzer, createRescue, fetchWords };
}
```

## Keep the configuration fixed

Call `loadPersianAnalyzer()` on search focus/open and reuse the returned analyzer. The sample retries after an import failure. `loadOptionalRescue()` only loads factories; you must create rescue with the same analyzer and provide collected text or remote words plus an `isKnown` check. Loading a module does not enable corrections automatically.

Do not query a full-profile index with standard while waiting for the lexicon. Wait for the correct analyzer and show a loading state. Changing the analyzer halfway through a session without rebuilding the index changes matching behavior.

## Bundling and delivery

Bare imports require a bundler or a correctly configured import map. The package is ESM with `sideEffects: false`; it provides no global script build. Dynamic import requests create split points only when your build tool supports code splitting. Inspect the produced assets rather than assuming a particular bundle size.

Use `fa-search-kit/keyboard` for keyboard candidates alone. Import `fa-search-kit/analytics` only if you need canonical keys. Never import `/pagefind/build` or `/rescue/build` in browser code; the latter uses Node filesystem, crypto, and gzip APIs.

`fetchWords` uses browser networking and decompression APIs listed in [installation](installation.md). Manifest and piece promises are cached; failed downloads can be retried on a later request. Its `bytes` counter counts response-body bytes read, which may already have been decompressed by the server/browser; it is not a precise total network-transfer meter.

Rescue with a fully collected in-memory corpus needs no remote vocabulary. Pagefind rescue performs index probes and may fetch word pieces. These requests can fail independently of ordinary search; preserve usable typed results and make failures recoverable.
