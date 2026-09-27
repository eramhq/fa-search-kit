/**
 * Dev/test split by target: every query of one base (its canonical form and
 * all its variants) lands in the same half, decided by a hash of the base id.
 * Tuning is judged on dev only; the phase-end number is quoted from test,
 * computed once.
 */
import { seedOf } from "./rng.ts";

export const SPLITS = ["dev", "test", "all"] as const;
export type Split = (typeof SPLITS)[number];

export const splitOf = (base: string): "dev" | "test" => ((seedOf(`split/${base}`) & 1) === 0 ? "dev" : "test");

export const inSplit = (base: string, split: Split) => split === "all" || splitOf(base) === split;
