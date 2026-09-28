/**
 * Trained lemma models on disk (bench/data/lemma/models/, gitignored): the serialized
 * model, the confidence threshold chosen for it, and the words it trained on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Source } from "./examples.ts";
import { gzipBytes, type Model } from "./model.ts";
import { decodeTree } from "./tree.ts";
import { decodeLinear } from "./linear.ts";
import { decodeList } from "./list.ts";

export const MODEL_DIR = new URL("../../bench/data/lemma/models/", import.meta.url);

export interface Saved { name: string; kind: Model["kind"]; source: Source; budget: number; options: object; bytes: number; tau: number; data: string }

export function decode(kind: Model["kind"], data: string): Model {
  return kind === "tree" ? decodeTree(data) : kind === "linear" ? decodeLinear(data) : decodeList(data);
}

export function saveModel(s: Omit<Saved, "bytes">, words: string[]) {
  mkdirSync(MODEL_DIR, { recursive: true });
  writeFileSync(new URL(`${s.name}.json`, MODEL_DIR), JSON.stringify({ ...s, bytes: gzipBytes(s.data) }) + "\n");
  writeFileSync(new URL(`${s.name}.words.txt`, MODEL_DIR), words.join("\n") + "\n");
}

export function loadSaved(name: string): Saved & { model: Model } {
  const f = new URL(`${name}.json`, MODEL_DIR);
  if (!existsSync(f)) throw new Error(`no trained model ${name}: run node scripts/build-lemma.ts --train`);
  const s = JSON.parse(readFileSync(f, "utf8")) as Saved;
  return { ...s, model: decode(s.kind, s.data) };
}

export function setTau(name: string, tau: number) {
  const f = new URL(`${name}.json`, MODEL_DIR);
  const s = JSON.parse(readFileSync(f, "utf8")) as Saved;
  writeFileSync(f, JSON.stringify({ ...s, tau }) + "\n");
}

export const trainedWords = (name: string) => new Set(readFileSync(new URL(`${name}.words.txt`, MODEL_DIR), "utf8").split("\n").filter(Boolean));
