/**
 * Download the benchmark's raw sources into bench/data/raw, pinned by revision.
 *
 *     node bench/fetch.ts
 *
 * Everything here is for evaluation only and is never bundled (see CLAUDE.md,
 * "License hygiene"). bench/data/ is gitignored; this script is how anyone
 * rebuilds it. Each file's sha256 is written to bench/data/raw/SOURCES.json so a
 * rerun can tell whether upstream changed under a pinned URL.
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

export const RAW = new URL("data/raw/", import.meta.url);

interface Source {
  file: string;
  url: string;
  license: string;
  note: string;
}

const HF = "https://huggingface.co/datasets";
const WIKI_REV = "b04c8d1ceb2f5cd4588862100d08de323dccfbaa";
const DIGIKALA_REV = "89c3133b169c8d3793db8834f56f32fee33d9db0";
const PN_REV = "d023c3f4133f08aed2ce57d28469275a93c9166c";
const HAZM_REV = "a399c8293c5165544aaef76ead78bda9f4275888";
/** UD treebanks, master = release 2.16 line; pinned commits (2026-09-27). */
const SERAJI_REV = "b7029568b3d45833f6b1ca9b088a6c8a8778ecd2";
const PERDT_REV = "a920904a0911822e555602fddfda3c459e22d601";
const UD = "https://raw.githubusercontent.com/UniversalDependencies";

export const SOURCES: Source[] = [
  {
    file: "wiki-fa-00000.parquet",
    url: `${HF}/wikimedia/wikipedia/resolve/${WIKI_REV}/20231101.fa/train-00000-of-00004.parquet`,
    license: "CC BY-SA 3.0 / GFDL (evaluation only)",
    note: "Persian Wikipedia dump 2023-11-01, first of four shards",
  },
  {
    file: "digikala-products.csv",
    url: `${HF}/RadeAI/Digikala_comments_products/resolve/${DIGIKALA_REV}/digikala-products.csv`,
    license: "card says MIT; scraped from digikala.com (evaluation only)",
    note: "about 1.2M Digikala product titles with category and brand",
  },
  {
    file: "pn_summary.zip",
    url: `${HF}/HooshvareLab/pn_summary/resolve/${PN_REV}/data/pn_summary.zip`,
    license: "card says MIT; news agency text (evaluation only)",
    note: "pn-summary: Persian news articles with titles (arXiv:2012.11204)",
  },
  {
    file: "hazm-verbs.dat",
    url: `https://raw.githubusercontent.com/roshan-research/hazm/${HAZM_REV}/hazm/data/verbs.dat`,
    license: "MIT",
    note: "Hazm verb list, one `past#present` stem pair per line",
  },
  {
    file: "hazm-stopwords.dat",
    url: `https://raw.githubusercontent.com/roshan-research/hazm/${HAZM_REV}/hazm/data/stopwords.dat`,
    license: "MIT",
    note: "Hazm stop words",
  },
  ...(["train", "dev", "test"] as const).flatMap((split): Source[] => [
    {
      file: `ud/fa_seraji-ud-${split}.conllu`,
      url: `${UD}/UD_Persian-Seraji/${SERAJI_REV}/fa_seraji-ud-${split}.conllu`,
      license: "CC BY-SA 4.0 (evaluation only)",
      note: "UD Persian-Seraji: hand-checked lemmas; conflation and rejoin checks",
    },
    {
      file: `ud/fa_perdt-ud-${split}.conllu`,
      url: `${UD}/UD_Persian-PerDT/${PERDT_REV}/fa_perdt-ud-${split}.conllu`,
      license: "CC BY-SA 4.0 (evaluation only)",
      note: "UD Persian-PerDT: hand-checked lemmas (verbs: past stem); conflation, rejoin and verb-tense-ud",
    },
  ]),
];

async function download(url: string, dest: URL): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

function sha256(path: URL): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (import.meta.main) {
  mkdirSync(new URL("ud/", RAW), { recursive: true });
  const manifest: Record<string, Source & { sha256: string }> = {};
  for (const source of SOURCES) {
    const dest = new URL(source.file, RAW);
    if (existsSync(dest)) {
      console.log(`have  ${source.file}`);
    } else {
      console.log(`fetch ${source.file}`);
      await download(source.url, dest);
    }
    manifest[source.file] = { ...source, sha256: sha256(dest) };
  }

  const pnDir = new URL("pn_summary/", RAW);
  if (!existsSync(pnDir)) {
    execFileSync("unzip", ["-q", "-o", new URL("pn_summary.zip", RAW).pathname, "-d", pnDir.pathname]);
  }

  writeFileSync(new URL("SOURCES.json", RAW), JSON.stringify(manifest, null, 2) + "\n");
  console.log("wrote bench/data/raw/SOURCES.json");
}
