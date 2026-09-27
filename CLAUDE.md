# fa-search

Persian search that works in JS, the browser and static sites: a symmetric
analyzer (normalize → tokenize → Snowball stem → lexicon), query rescue (wrong
keyboard layout, typos, sound-alike spellings), adapters for Pagefind, Orama,
MiniSearch, FlexSearch and Lunr, upstream PRs, and a public benchmark.

- **[PLAN.md](PLAN.md)**: the plan and phases. Start at the current phase; Phase 0 (benchmark) comes first.
- **[RESEARCH.md](RESEARCH.md)**: findings with sources and a trust tag on each line. Read it before searching the web; add to it instead of re-researching.

## Rules

- **Test every claim.** A "can't" or "don't" from anyone (Snowball maintainers, Lucene, a paper, a research summary, us) is a hypothesis until the benchmark measures it. Try it, keep what wins, and write up what loses so nobody retries it blindly. The starting list is in PLAN.md under "Principle".
- **Benchmark gates everything.** A change ships only if it improves its target rows (recall@10, MRR per variant type × engine × config) without regressing the others.
- **Same analyzer at index time and query time.** Never let the two drift. Index mode may emit extra terms (a ZWNJ compound and its parts); query mode emits one term per token; query terms ⊆ index terms of the same text (tested in `test/analyzer.test.ts`).
- **License hygiene.** Ship only MIT/BSD/Apache data. CC BY-SA, ODbL and GPL data (UD treebanks, Wikipedia, lemmatization-lists, Bijankhan, Perstem) are for evaluation only.
- **Size budgets.** Core (normalize + tokenize + stem) ≤ 5 KB gzipped; lexicon ≤ 15 KB. Enforced by `scripts/size.ts`.
- **Don't break ZWNJ before the stemmer.** Snowball's Persian stemmer uses ZWNJ to find prefixes.
- Stack: TypeScript, ESM, zero runtime deps, vitest, `tsc`, Node 22+. No Rust except in the upstream Pagefind PR.
- Separate from tiny-finglish. Finglish is out of scope here.
- The npm name `fa-search` is taken; choose the package name before publishing.
