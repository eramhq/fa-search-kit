/**
 * fa-search: Persian text analysis for search in JS, the browser and static sites.
 *
 *     import { createAnalyzer } from "fa-search";
 *     const { analyze } = createAnalyzer();           // profile "standard"
 *     analyze("می روم به كتابخانه")                    // same terms at index and query time
 */
export { createAnalyzer, type Analyzer, type AnalyzerOptions, type Mode, type Profile } from "./analyzer.ts";
export { normalize, type Normalized, type NormalizeOptions } from "./normalize.ts";
export { tokenize, type Token } from "./tokenize.ts";
export { Stemmer, type CliticOptions, type Lexicon, type StemOptions } from "./stem.ts";
