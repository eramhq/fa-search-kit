/**
 * Persian keyboard layouts, key by key, for the "wrong keyboard layout" query
 * variant: the user meant to type Persian but the OS was on US English (or the
 * other way round).
 *
 * Every table is keyed by the character the same physical key produces on a
 * US QWERTY layout: `base` uses the unshifted US character ("q", "[", ";"),
 * `shift` the shifted one ("Q", "{", ":"). Values are exactly what the Persian
 * layout emits for that key, code point for code point. All 47 printable keys
 * of the ANSI main block are listed in both layers, including keys that emit
 * the same ASCII character as US, so a missing key always means "not a key".
 *
 * The tables were generated from primary sources, not typed by hand:
 * - Windows: the KLC exports of kbdfar.dll and kbdfa.dll (10.0.29667.1000)
 *   published by kbdlayout.info, which are dumps of the DLLs' KBDTABLES.
 * - macOS: the layouts shipped in macOS 26.5.2, read on a Mac with
 *   UCKeyTranslate() over each layout's 'uchr' data, lined up against
 *   com.apple.keylayout.US by virtual key code.
 * Cross-checks (ISIRI 9147 itself, xkeyboard-config symbols/ir) are noted per
 * layout and per key where they disagree.
 *
 * Out of scope: Caps Lock, AltGr/Option layers, the numeric keypad, and the
 * ISO key between left Shift and Z. Only ZWNJ reaches beyond base and shift,
 * and it is handled explicitly through `zwnjOnUs`.
 */

export type Layout = {
  /** Stable id used by the benchmark: "isiri9147", "win-legacy", "mac-legacy". */
  id: string;
  /** Human-readable name, as the OS shows it. */
  name: string;
  /** Where the table came from, primary source first. */
  source: string[];
  /** Unshifted key (by its US character) → what this layout emits. */
  base: Record<string, string>;
  /** Shifted key (by its US shifted character) → what this layout emits. */
  shift: Record<string, string>;
  /**
   * What a ZWNJ (U+200C, the Persian half-space) typed on this layout turns
   * into when the OS is on US instead. On layouts where ZWNJ is Shift+Space the
   * US layout gives a plain space; where it needs Ctrl+Shift+2 the US layout
   * gives nothing printable, so the half-space simply disappears.
   */
  zwnjOnUs: string;
};

/** ZERO WIDTH NON-JOINER, the Persian half-space (نیم\u200Cفاصله). */
export const ZWNJ = "\u200C";

/**
 * Windows "Persian (Standard)", kbdfar.dll, KLID 00050429. This is Microsoft's
 * implementation of ISIRI 9147 and the layout Iranian users are now taught.
 *
 * Letters are identical to ISIRI 9147 (checked against the standard's own
 * table 1, xkeyboard-config `ir(pes)` and macOS "Persian – Standard"). Windows
 * departs from the standard on three shifted keys, marked below: Shift+` (ZWJ
 * instead of ÷), Shift+4 (the four-letter ligature «ریال» instead of U+FDFC)
 * and Shift+X (repeats ط instead of U+0653 MADDAH ABOVE).
 *
 * Yeh and kaf: base keys emit Persian ی U+06CC (d) and ک U+06A9 (;). Arabic
 * ي U+064A is Shift+D and Arabic ك U+0643 is Shift+Z.
 *
 * ZWNJ: Shift+Space, and also Shift+B (both per ISIRI 9147), and Ctrl+Shift+2.
 * `zwnjOnUs` assumes Shift+Space, which gives a space on US. A user who
 * reaches for Shift+B instead gets "B" (the table already says so).
 */
const ISIRI9147: Layout = {
  id: "isiri9147",
  name: "Persian (Standard) / ISIRI 9147 (Windows kbdfar)",
  source: [
    "https://kbdlayout.info/kbdfar/download/klc (kbdfar.dll 10.0.29667.1000)",
    "https://persian-computing.org/archives/ISIRI/ISIRI-9147.pdf (table 1)",
    "https://gitlab.freedesktop.org/xkeyboard-config/xkeyboard-config/-/raw/master/symbols/ir (pes)",
    "macOS 26.5.2 com.apple.keylayout.Persian-ISIRI2901 via UCKeyTranslate",
  ],
  base: {
    "`": "\u200d", // U+200D ZERO WIDTH JOINER
    "1": "\u06f1", // ۱  U+06F1 EXTENDED ARABIC-INDIC DIGIT ONE
    "2": "\u06f2", // ۲  U+06F2 EXTENDED ARABIC-INDIC DIGIT TWO
    "3": "\u06f3", // ۳  U+06F3 EXTENDED ARABIC-INDIC DIGIT THREE
    "4": "\u06f4", // ۴  U+06F4 EXTENDED ARABIC-INDIC DIGIT FOUR
    "5": "\u06f5", // ۵  U+06F5 EXTENDED ARABIC-INDIC DIGIT FIVE
    "6": "\u06f6", // ۶  U+06F6 EXTENDED ARABIC-INDIC DIGIT SIX
    "7": "\u06f7", // ۷  U+06F7 EXTENDED ARABIC-INDIC DIGIT SEVEN
    "8": "\u06f8", // ۸  U+06F8 EXTENDED ARABIC-INDIC DIGIT EIGHT
    "9": "\u06f9", // ۹  U+06F9 EXTENDED ARABIC-INDIC DIGIT NINE
    "0": "\u06f0", // ۰  U+06F0 EXTENDED ARABIC-INDIC DIGIT ZERO
    "-": "-", // -  U+002D HYPHEN-MINUS
    "=": "=", // =  U+003D EQUALS SIGN
    "q": "\u0636", // ض  U+0636 ARABIC LETTER DAD
    "w": "\u0635", // ص  U+0635 ARABIC LETTER SAD
    "e": "\u062b", // ث  U+062B ARABIC LETTER THEH
    "r": "\u0642", // ق  U+0642 ARABIC LETTER QAF
    "t": "\u0641", // ف  U+0641 ARABIC LETTER FEH
    "y": "\u063a", // غ  U+063A ARABIC LETTER GHAIN
    "u": "\u0639", // ع  U+0639 ARABIC LETTER AIN
    "i": "\u0647", // ه  U+0647 ARABIC LETTER HEH
    "o": "\u062e", // خ  U+062E ARABIC LETTER KHAH
    "p": "\u062d", // ح  U+062D ARABIC LETTER HAH
    "[": "\u062c", // ج  U+062C ARABIC LETTER JEEM
    "]": "\u0686", // چ  U+0686 ARABIC LETTER TCHEH
    "\\": "\\", // \  U+005C REVERSE SOLIDUS
    "a": "\u0634", // ش  U+0634 ARABIC LETTER SHEEN
    "s": "\u0633", // س  U+0633 ARABIC LETTER SEEN
    "d": "\u06cc", // ی  U+06CC ARABIC LETTER FARSI YEH
    "f": "\u0628", // ب  U+0628 ARABIC LETTER BEH
    "g": "\u0644", // ل  U+0644 ARABIC LETTER LAM
    "h": "\u0627", // ا  U+0627 ARABIC LETTER ALEF
    "j": "\u062a", // ت  U+062A ARABIC LETTER TEH
    "k": "\u0646", // ن  U+0646 ARABIC LETTER NOON
    "l": "\u0645", // م  U+0645 ARABIC LETTER MEEM
    ";": "\u06a9", // ک  U+06A9 ARABIC LETTER KEHEH
    "'": "\u06af", // گ  U+06AF ARABIC LETTER GAF
    "z": "\u0638", // ظ  U+0638 ARABIC LETTER ZAH
    "x": "\u0637", // ط  U+0637 ARABIC LETTER TAH
    "c": "\u0632", // ز  U+0632 ARABIC LETTER ZAIN
    "v": "\u0631", // ر  U+0631 ARABIC LETTER REH
    "b": "\u0630", // ذ  U+0630 ARABIC LETTER THAL
    "n": "\u062f", // د  U+062F ARABIC LETTER DAL
    "m": "\u067e", // پ  U+067E ARABIC LETTER PEH
    ",": "\u0648", // و  U+0648 ARABIC LETTER WAW
    ".": ".", // .  U+002E FULL STOP
    "/": "/", // /  U+002F SOLIDUS
  },
  shift: {
    "~": "\u200d", // U+200D ZERO WIDTH JOINER. ISIRI 9147 and xkb: U+00F7 DIVISION SIGN
    "!": "!", // !  U+0021 EXCLAMATION MARK
    "@": "\u066c", // ٬  U+066C ARABIC THOUSANDS SEPARATOR
    "#": "\u066b", // ٫  U+066B ARABIC DECIMAL SEPARATOR
    "$": "\u0631\u06cc\u0627\u0644", // ریال  U+0631 + U+06CC + U+0627 + U+0644. ligature «ریال»; ISIRI 9147 and xkb: U+FDFC RIAL SIGN
    "%": "\u066a", // ٪  U+066A ARABIC PERCENT SIGN
    "^": "\u00d7", // ×  U+00D7 MULTIPLICATION SIGN
    "&": "\u060c", // ،  U+060C ARABIC COMMA
    "*": "*", // *  U+002A ASTERISK
    "(": ")", // )  U+0029 RIGHT PARENTHESIS
    ")": "(", // (  U+0028 LEFT PARENTHESIS
    "_": "\u0640", // ـ  U+0640 ARABIC TATWEEL
    "+": "+", // +  U+002B PLUS SIGN
    "Q": "\u0652", // ◌ْ  U+0652 ARABIC SUKUN
    "W": "\u064c", // ◌ٌ  U+064C ARABIC DAMMATAN
    "E": "\u064d", // ◌ٍ  U+064D ARABIC KASRATAN
    "R": "\u064b", // ◌ً  U+064B ARABIC FATHATAN
    "T": "\u064f", // ◌ُ  U+064F ARABIC DAMMA
    "Y": "\u0650", // ◌ِ  U+0650 ARABIC KASRA
    "U": "\u064e", // ◌َ  U+064E ARABIC FATHA
    "I": "\u0651", // ◌ّ  U+0651 ARABIC SHADDA
    "O": "]", // ]  U+005D RIGHT SQUARE BRACKET
    "P": "[", // [  U+005B LEFT SQUARE BRACKET
    "{": "}", // }  U+007D RIGHT CURLY BRACKET
    "}": "{", // {  U+007B LEFT CURLY BRACKET
    "|": "|", // |  U+007C VERTICAL LINE
    "A": "\u0624", // ؤ  U+0624 ARABIC LETTER WAW WITH HAMZA ABOVE
    "S": "\u0626", // ئ  U+0626 ARABIC LETTER YEH WITH HAMZA ABOVE
    "D": "\u064a", // ي  U+064A ARABIC LETTER YEH. Arabic yeh
    "F": "\u0625", // إ  U+0625 ARABIC LETTER ALEF WITH HAMZA BELOW
    "G": "\u0623", // أ  U+0623 ARABIC LETTER ALEF WITH HAMZA ABOVE
    "H": "\u0622", // آ  U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE
    "J": "\u0629", // ة  U+0629 ARABIC LETTER TEH MARBUTA
    "K": "\u00bb", // »  U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
    "L": "\u00ab", // «  U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
    ":": ":", // :  U+003A COLON
    "\"": "\u061b", // ؛  U+061B ARABIC SEMICOLON
    "Z": "\u0643", // ك  U+0643 ARABIC LETTER KAF. Arabic kaf
    "X": "\u0637", // ط  U+0637 ARABIC LETTER TAH. repeats the base key; ISIRI 9147 and xkb: U+0653 ARABIC MADDAH ABOVE
    "C": "\u0698", // ژ  U+0698 ARABIC LETTER JEH
    "V": "\u0670", // ◌ٰ  U+0670 ARABIC LETTER SUPERSCRIPT ALEF
    "B": "\u200c", // U+200C ZERO WIDTH NON-JOINER. ZWNJ (also Shift+Space)
    "N": "\u0654", // ◌ٔ  U+0654 ARABIC HAMZA ABOVE
    "M": "\u0621", // ء  U+0621 ARABIC LETTER HAMZA
    "<": ">", // >  U+003E GREATER-THAN SIGN
    ">": "<", // <  U+003C LESS-THAN SIGN
    "?": "\u061f", // ؟  U+061F ARABIC QUESTION MARK
  },
  zwnjOnUs: " ",
};

/**
 * Windows legacy "Persian", kbdfa.dll, KLID 00000429. The older Microsoft
 * layout (an extended Arabic layout). It is still the one Windows adds by
 * default for the Persian language (kbdlayout.info marks it as the default for
 * fa), and its table has not changed from 5.2.3790.0 (Server 2003 / XP x64) to
 * 10.0.29667.1000. kbdfar only appeared in Windows 8 (6.2.8250.0).
 *
 * Differs from ISIRI 9147 on letters: پ is on \ (not m), ئ is on m (not
 * Shift+S), and digits are ASCII 0–9, not Persian ۰–۹. The Shift layer is
 * mostly different too (harakat on A S D F, «» on K L, ؤ إ أ on V B N, …).
 *
 * Yeh and kaf: the current DLL emits Persian ی U+06CC on d and ک U+06A9 on ;.
 * Arabic ي U+064A is on Shift+X, and the Shift+R ligature «ريال» is spelled
 * with Arabic ي. There is no Arabic ك key.
 *
 * ZWNJ: only Ctrl+Shift+2 (Shift+Space is a plain space). On US that chord is
 * not a printable character, so the half-space vanishes: `zwnjOnUs` is "".
 */
const WIN_LEGACY: Layout = {
  id: "win-legacy",
  name: "Persian (Windows legacy, kbdfa)",
  source: [
    "https://kbdlayout.info/KBDFA/download/klc (kbdfa.dll 10.0.29667.1000)",
    "https://gitlab.freedesktop.org/xkeyboard-config/xkeyboard-config/-/raw/master/symbols/ir (winkeys)",
  ],
  base: {
    "`": "\u00f7", // ÷  U+00F7 DIVISION SIGN
    "1": "1", // 1  U+0031 DIGIT ONE
    "2": "2", // 2  U+0032 DIGIT TWO
    "3": "3", // 3  U+0033 DIGIT THREE
    "4": "4", // 4  U+0034 DIGIT FOUR
    "5": "5", // 5  U+0035 DIGIT FIVE
    "6": "6", // 6  U+0036 DIGIT SIX
    "7": "7", // 7  U+0037 DIGIT SEVEN
    "8": "8", // 8  U+0038 DIGIT EIGHT
    "9": "9", // 9  U+0039 DIGIT NINE
    "0": "0", // 0  U+0030 DIGIT ZERO
    "-": "-", // -  U+002D HYPHEN-MINUS
    "=": "=", // =  U+003D EQUALS SIGN
    "q": "\u0636", // ض  U+0636 ARABIC LETTER DAD
    "w": "\u0635", // ص  U+0635 ARABIC LETTER SAD
    "e": "\u062b", // ث  U+062B ARABIC LETTER THEH
    "r": "\u0642", // ق  U+0642 ARABIC LETTER QAF
    "t": "\u0641", // ف  U+0641 ARABIC LETTER FEH
    "y": "\u063a", // غ  U+063A ARABIC LETTER GHAIN
    "u": "\u0639", // ع  U+0639 ARABIC LETTER AIN
    "i": "\u0647", // ه  U+0647 ARABIC LETTER HEH
    "o": "\u062e", // خ  U+062E ARABIC LETTER KHAH
    "p": "\u062d", // ح  U+062D ARABIC LETTER HAH
    "[": "\u062c", // ج  U+062C ARABIC LETTER JEEM
    "]": "\u0686", // چ  U+0686 ARABIC LETTER TCHEH
    "\\": "\u067e", // پ  U+067E ARABIC LETTER PEH. pek is here, not on m
    "a": "\u0634", // ش  U+0634 ARABIC LETTER SHEEN
    "s": "\u0633", // س  U+0633 ARABIC LETTER SEEN
    "d": "\u06cc", // ی  U+06CC ARABIC LETTER FARSI YEH
    "f": "\u0628", // ب  U+0628 ARABIC LETTER BEH
    "g": "\u0644", // ل  U+0644 ARABIC LETTER LAM
    "h": "\u0627", // ا  U+0627 ARABIC LETTER ALEF
    "j": "\u062a", // ت  U+062A ARABIC LETTER TEH
    "k": "\u0646", // ن  U+0646 ARABIC LETTER NOON
    "l": "\u0645", // م  U+0645 ARABIC LETTER MEEM
    ";": "\u06a9", // ک  U+06A9 ARABIC LETTER KEHEH
    "'": "\u06af", // گ  U+06AF ARABIC LETTER GAF
    "z": "\u0638", // ظ  U+0638 ARABIC LETTER ZAH
    "x": "\u0637", // ط  U+0637 ARABIC LETTER TAH
    "c": "\u0632", // ز  U+0632 ARABIC LETTER ZAIN
    "v": "\u0631", // ر  U+0631 ARABIC LETTER REH
    "b": "\u0630", // ذ  U+0630 ARABIC LETTER THAL
    "n": "\u062f", // د  U+062F ARABIC LETTER DAL
    "m": "\u0626", // ئ  U+0626 ARABIC LETTER YEH WITH HAMZA ABOVE. yeh with hamza, not pek
    ",": "\u0648", // و  U+0648 ARABIC LETTER WAW
    ".": ".", // .  U+002E FULL STOP
    "/": "/", // /  U+002F SOLIDUS
  },
  shift: {
    "~": "\u00d7", // ×  U+00D7 MULTIPLICATION SIGN
    "!": "!", // !  U+0021 EXCLAMATION MARK
    "@": "@", // @  U+0040 COMMERCIAL AT
    "#": "#", // #  U+0023 NUMBER SIGN
    "$": "$", // $  U+0024 DOLLAR SIGN
    "%": "%", // %  U+0025 PERCENT SIGN
    "^": "^", // ^  U+005E CIRCUMFLEX ACCENT
    "&": "&", // &  U+0026 AMPERSAND
    "*": "*", // *  U+002A ASTERISK
    "(": ")", // )  U+0029 RIGHT PARENTHESIS
    ")": "(", // (  U+0028 LEFT PARENTHESIS
    "_": "_", // _  U+005F LOW LINE
    "+": "+", // +  U+002B PLUS SIGN
    "Q": "\u064b", // ◌ً  U+064B ARABIC FATHATAN
    "W": "\u064c", // ◌ٌ  U+064C ARABIC DAMMATAN
    "E": "\u064d", // ◌ٍ  U+064D ARABIC KASRATAN
    "R": "\u0631\u064a\u0627\u0644", // ريال  U+0631 + U+064A + U+0627 + U+0644. ligature «ريال», spelled with ARABIC yeh U+064A
    "T": "\u060c", // ،  U+060C ARABIC COMMA
    "Y": "\u061b", // ؛  U+061B ARABIC SEMICOLON
    "U": ",", // ,  U+002C COMMA
    "I": "]", // ]  U+005D RIGHT SQUARE BRACKET
    "O": "[", // [  U+005B LEFT SQUARE BRACKET
    "P": "\\", // \  U+005C REVERSE SOLIDUS
    "{": "}", // }  U+007D RIGHT CURLY BRACKET
    "}": "{", // {  U+007B LEFT CURLY BRACKET
    "|": "|", // |  U+007C VERTICAL LINE
    "A": "\u064e", // ◌َ  U+064E ARABIC FATHA
    "S": "\u064f", // ◌ُ  U+064F ARABIC DAMMA
    "D": "\u0650", // ◌ِ  U+0650 ARABIC KASRA
    "F": "\u0651", // ◌ّ  U+0651 ARABIC SHADDA
    "G": "\u06c0", // ۀ  U+06C0 ARABIC LETTER HEH WITH YEH ABOVE
    "H": "\u0622", // آ  U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE
    "J": "\u0640", // ـ  U+0640 ARABIC TATWEEL
    "K": "\u00ab", // «  U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
    "L": "\u00bb", // »  U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
    ":": ":", // :  U+003A COLON
    "\"": "\"", // "  U+0022 QUOTATION MARK
    "Z": "\u0629", // ة  U+0629 ARABIC LETTER TEH MARBUTA
    "X": "\u064a", // ي  U+064A ARABIC LETTER YEH. Arabic yeh
    "C": "\u0698", // ژ  U+0698 ARABIC LETTER JEH
    "V": "\u0624", // ؤ  U+0624 ARABIC LETTER WAW WITH HAMZA ABOVE
    "B": "\u0625", // إ  U+0625 ARABIC LETTER ALEF WITH HAMZA BELOW. xkb "winkeys" has U+0623 here (swapped with N); kbdfa.dll wins
    "N": "\u0623", // أ  U+0623 ARABIC LETTER ALEF WITH HAMZA ABOVE. xkb "winkeys" has U+0625 here (swapped with B); kbdfa.dll wins
    "M": "\u0621", // ء  U+0621 ARABIC LETTER HAMZA
    "<": "<", // <  U+003C LESS-THAN SIGN
    ">": ">", // >  U+003E GREATER-THAN SIGN
    "?": "\u061f", // ؟  U+061F ARABIC QUESTION MARK
  },
  zwnjOnUs: "",
};

/**
 * macOS "Persian – Legacy", input source com.apple.keylayout.Persian (its
 * internal layout name is plain "Persian"). This is the layout Mac users mean
 * when they say the Mac puts ز ذ د ر پ in different places from Windows. macOS
 * 26 shows it as "Persian – Legacy" and returns
 * com.apple.keylayout.Persian-ISIRI2901 ("Persian – Standard", see
 * MAC_STANDARD) as the default for the fa language.
 *
 * This is Apple's own arrangement. Compared with ISIRI 9147 the bottom row is
 * rearranged: ذ on c, د on v, ز on b, ر on n, و on m, ، on the comma key,
 * ژ on /, and پ on the ` key. ئ is on Shift+C. Six Shift keys (F G J K L X)
 * emit nothing at all, recorded here as "".
 *
 * Yeh and kaf: base keys emit Persian ی U+06CC (d) and ک U+06A9 (;). Arabic
 * ي U+064A is Shift+D. Arabic ك U+0643 exists only on Option+; (out of scope).
 *
 * ZWNJ: Shift+Space, so it becomes a plain space on US.
 */
const MAC: Layout = {
  id: "mac-legacy",
  name: "Persian – Legacy (macOS, com.apple.keylayout.Persian)",
  source: ["macOS 26.5.2 com.apple.keylayout.Persian via UCKeyTranslate"],
  base: {
    "`": "\u067e", // پ  U+067E ARABIC LETTER PEH. pek (also on the ISO key left of 1)
    "1": "\u06f1", // ۱  U+06F1 EXTENDED ARABIC-INDIC DIGIT ONE
    "2": "\u06f2", // ۲  U+06F2 EXTENDED ARABIC-INDIC DIGIT TWO
    "3": "\u06f3", // ۳  U+06F3 EXTENDED ARABIC-INDIC DIGIT THREE
    "4": "\u06f4", // ۴  U+06F4 EXTENDED ARABIC-INDIC DIGIT FOUR
    "5": "\u06f5", // ۵  U+06F5 EXTENDED ARABIC-INDIC DIGIT FIVE
    "6": "\u06f6", // ۶  U+06F6 EXTENDED ARABIC-INDIC DIGIT SIX
    "7": "\u06f7", // ۷  U+06F7 EXTENDED ARABIC-INDIC DIGIT SEVEN
    "8": "\u06f8", // ۸  U+06F8 EXTENDED ARABIC-INDIC DIGIT EIGHT
    "9": "\u06f9", // ۹  U+06F9 EXTENDED ARABIC-INDIC DIGIT NINE
    "0": "\u06f0", // ۰  U+06F0 EXTENDED ARABIC-INDIC DIGIT ZERO
    "-": "-", // -  U+002D HYPHEN-MINUS
    "=": "=", // =  U+003D EQUALS SIGN
    "q": "\u0636", // ض  U+0636 ARABIC LETTER DAD
    "w": "\u0635", // ص  U+0635 ARABIC LETTER SAD
    "e": "\u062b", // ث  U+062B ARABIC LETTER THEH
    "r": "\u0642", // ق  U+0642 ARABIC LETTER QAF
    "t": "\u0641", // ف  U+0641 ARABIC LETTER FEH
    "y": "\u063a", // غ  U+063A ARABIC LETTER GHAIN
    "u": "\u0639", // ع  U+0639 ARABIC LETTER AIN
    "i": "\u0647", // ه  U+0647 ARABIC LETTER HEH
    "o": "\u062e", // خ  U+062E ARABIC LETTER KHAH
    "p": "\u062d", // ح  U+062D ARABIC LETTER HAH
    "[": "\u062c", // ج  U+062C ARABIC LETTER JEEM
    "]": "\u0686", // چ  U+0686 ARABIC LETTER TCHEH
    "\\": "\\", // \  U+005C REVERSE SOLIDUS
    "a": "\u0634", // ش  U+0634 ARABIC LETTER SHEEN
    "s": "\u0633", // س  U+0633 ARABIC LETTER SEEN
    "d": "\u06cc", // ی  U+06CC ARABIC LETTER FARSI YEH
    "f": "\u0628", // ب  U+0628 ARABIC LETTER BEH
    "g": "\u0644", // ل  U+0644 ARABIC LETTER LAM
    "h": "\u0627", // ا  U+0627 ARABIC LETTER ALEF
    "j": "\u062a", // ت  U+062A ARABIC LETTER TEH
    "k": "\u0646", // ن  U+0646 ARABIC LETTER NOON
    "l": "\u0645", // م  U+0645 ARABIC LETTER MEEM
    ";": "\u06a9", // ک  U+06A9 ARABIC LETTER KEHEH
    "'": "\u06af", // گ  U+06AF ARABIC LETTER GAF
    "z": "\u0638", // ظ  U+0638 ARABIC LETTER ZAH
    "x": "\u0637", // ط  U+0637 ARABIC LETTER TAH
    "c": "\u0630", // ذ  U+0630 ARABIC LETTER THAL. thal and zain swapped vs Windows
    "v": "\u062f", // د  U+062F ARABIC LETTER DAL. dal
    "b": "\u0632", // ز  U+0632 ARABIC LETTER ZAIN. zain
    "n": "\u0631", // ر  U+0631 ARABIC LETTER REH. reh
    "m": "\u0648", // و  U+0648 ARABIC LETTER WAW. waw
    ",": "\u060c", // ،  U+060C ARABIC COMMA. Arabic comma, not waw
    ".": ".", // .  U+002E FULL STOP
    "/": "\u0698", // ژ  U+0698 ARABIC LETTER JEH. jeh
  },
  shift: {
    "~": "/", // /  U+002F SOLIDUS
    "!": "!", // !  U+0021 EXCLAMATION MARK
    "@": "\u274a", // ❊  U+274A EIGHT TEARDROP-SPOKED PROPELLER ASTERISK
    "#": "#", // #  U+0023 NUMBER SIGN
    "$": "$", // $  U+0024 DOLLAR SIGN
    "%": "\u066a", // ٪  U+066A ARABIC PERCENT SIGN
    "^": "^", // ^  U+005E CIRCUMFLEX ACCENT
    "&": "&", // &  U+0026 AMPERSAND
    "*": "*", // *  U+002A ASTERISK
    "(": ")", // )  U+0029 RIGHT PARENTHESIS
    ")": "(", // (  U+0028 LEFT PARENTHESIS
    "_": "\u0640", // ـ  U+0640 ARABIC TATWEEL
    "+": "+", // +  U+002B PLUS SIGN
    "Q": "\u064e", // ◌َ  U+064E ARABIC FATHA
    "W": "\u064b", // ◌ً  U+064B ARABIC FATHATAN
    "E": "\u0650", // ◌ِ  U+0650 ARABIC KASRA
    "R": "\u064d", // ◌ٍ  U+064D ARABIC KASRATAN
    "T": "\u064f", // ◌ُ  U+064F ARABIC DAMMA
    "Y": "\u064c", // ◌ٌ  U+064C ARABIC DAMMATAN
    "U": "\u0651", // ◌ّ  U+0651 ARABIC SHADDA
    "I": "\u00f7", // ÷  U+00F7 DIVISION SIGN
    "O": "]", // ]  U+005D RIGHT SQUARE BRACKET
    "P": "[", // [  U+005B LEFT SQUARE BRACKET
    "{": "}", // }  U+007D RIGHT CURLY BRACKET
    "}": "{", // {  U+007B LEFT CURLY BRACKET
    "|": "|", // |  U+007C VERTICAL LINE
    "A": "\u00ab", // «  U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
    "S": "\u00bb", // »  U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
    "D": "\u064a", // ي  U+064A ARABIC LETTER YEH. Arabic yeh
    "F": "", // produces nothing
    "G": "", // produces nothing
    "H": "\u0622", // آ  U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE
    "J": "", // produces nothing
    "K": "", // produces nothing
    "L": "", // produces nothing
    ":": ":", // :  U+003A COLON
    "\"": "\u061b", // ؛  U+061B ARABIC SEMICOLON
    "Z": "'", // '  U+0027 APOSTROPHE
    "X": "", // produces nothing
    "C": "\u0626", // ئ  U+0626 ARABIC LETTER YEH WITH HAMZA ABOVE
    "V": "\u0621", // ء  U+0621 ARABIC LETTER HAMZA
    "B": "\u0623", // أ  U+0623 ARABIC LETTER ALEF WITH HAMZA ABOVE. same as Shift+N
    "N": "\u0623", // أ  U+0623 ARABIC LETTER ALEF WITH HAMZA ABOVE. same as Shift+B
    "M": "\u0624", // ؤ  U+0624 ARABIC LETTER WAW WITH HAMZA ABOVE
    "<": ">", // >  U+003E GREATER-THAN SIGN
    ">": "<", // <  U+003C LESS-THAN SIGN
    "?": "\u061f", // ؟  U+061F ARABIC QUESTION MARK
  },
  zwnjOnUs: " ",
};

/**
 * macOS "Persian – Standard", input source com.apple.keylayout.Persian-ISIRI2901
 * (internal layout name "Persian-ISIRI 2901"). On macOS 26 this is what
 * TISCopyInputSourceForLanguage("fa") returns, i.e. the default for Persian.
 *
 * Its base layer is identical to ISIRI9147 (Windows kbdfar) and its shift layer
 * follows ISIRI 9147 to the letter, except that Shift+, and Shift+. emit "<"
 * and ">" (the standard and Windows have them the other way round). Because
 * the letters match ISIRI9147 exactly it adds no new wrong-layout variants,
 * so it is exported for completeness but left out of LAYOUTS.
 */
export const MAC_STANDARD: Layout = {
  id: "mac-standard",
  name: "Persian – Standard (macOS, com.apple.keylayout.Persian-ISIRI2901)",
  source: ["macOS 26.5.2 com.apple.keylayout.Persian-ISIRI2901 via UCKeyTranslate"],
  base: {
    "`": "\u200d", // U+200D ZERO WIDTH JOINER
    "1": "\u06f1", // ۱  U+06F1 EXTENDED ARABIC-INDIC DIGIT ONE
    "2": "\u06f2", // ۲  U+06F2 EXTENDED ARABIC-INDIC DIGIT TWO
    "3": "\u06f3", // ۳  U+06F3 EXTENDED ARABIC-INDIC DIGIT THREE
    "4": "\u06f4", // ۴  U+06F4 EXTENDED ARABIC-INDIC DIGIT FOUR
    "5": "\u06f5", // ۵  U+06F5 EXTENDED ARABIC-INDIC DIGIT FIVE
    "6": "\u06f6", // ۶  U+06F6 EXTENDED ARABIC-INDIC DIGIT SIX
    "7": "\u06f7", // ۷  U+06F7 EXTENDED ARABIC-INDIC DIGIT SEVEN
    "8": "\u06f8", // ۸  U+06F8 EXTENDED ARABIC-INDIC DIGIT EIGHT
    "9": "\u06f9", // ۹  U+06F9 EXTENDED ARABIC-INDIC DIGIT NINE
    "0": "\u06f0", // ۰  U+06F0 EXTENDED ARABIC-INDIC DIGIT ZERO
    "-": "-", // -  U+002D HYPHEN-MINUS
    "=": "=", // =  U+003D EQUALS SIGN
    "q": "\u0636", // ض  U+0636 ARABIC LETTER DAD
    "w": "\u0635", // ص  U+0635 ARABIC LETTER SAD
    "e": "\u062b", // ث  U+062B ARABIC LETTER THEH
    "r": "\u0642", // ق  U+0642 ARABIC LETTER QAF
    "t": "\u0641", // ف  U+0641 ARABIC LETTER FEH
    "y": "\u063a", // غ  U+063A ARABIC LETTER GHAIN
    "u": "\u0639", // ع  U+0639 ARABIC LETTER AIN
    "i": "\u0647", // ه  U+0647 ARABIC LETTER HEH
    "o": "\u062e", // خ  U+062E ARABIC LETTER KHAH
    "p": "\u062d", // ح  U+062D ARABIC LETTER HAH
    "[": "\u062c", // ج  U+062C ARABIC LETTER JEEM
    "]": "\u0686", // چ  U+0686 ARABIC LETTER TCHEH
    "\\": "\\", // \  U+005C REVERSE SOLIDUS
    "a": "\u0634", // ش  U+0634 ARABIC LETTER SHEEN
    "s": "\u0633", // س  U+0633 ARABIC LETTER SEEN
    "d": "\u06cc", // ی  U+06CC ARABIC LETTER FARSI YEH
    "f": "\u0628", // ب  U+0628 ARABIC LETTER BEH
    "g": "\u0644", // ل  U+0644 ARABIC LETTER LAM
    "h": "\u0627", // ا  U+0627 ARABIC LETTER ALEF
    "j": "\u062a", // ت  U+062A ARABIC LETTER TEH
    "k": "\u0646", // ن  U+0646 ARABIC LETTER NOON
    "l": "\u0645", // م  U+0645 ARABIC LETTER MEEM
    ";": "\u06a9", // ک  U+06A9 ARABIC LETTER KEHEH
    "'": "\u06af", // گ  U+06AF ARABIC LETTER GAF
    "z": "\u0638", // ظ  U+0638 ARABIC LETTER ZAH
    "x": "\u0637", // ط  U+0637 ARABIC LETTER TAH
    "c": "\u0632", // ز  U+0632 ARABIC LETTER ZAIN
    "v": "\u0631", // ر  U+0631 ARABIC LETTER REH
    "b": "\u0630", // ذ  U+0630 ARABIC LETTER THAL
    "n": "\u062f", // د  U+062F ARABIC LETTER DAL
    "m": "\u067e", // پ  U+067E ARABIC LETTER PEH
    ",": "\u0648", // و  U+0648 ARABIC LETTER WAW
    ".": ".", // .  U+002E FULL STOP
    "/": "/", // /  U+002F SOLIDUS
  },
  shift: {
    "~": "\u00f7", // ÷  U+00F7 DIVISION SIGN
    "!": "!", // !  U+0021 EXCLAMATION MARK
    "@": "\u066c", // ٬  U+066C ARABIC THOUSANDS SEPARATOR
    "#": "\u066b", // ٫  U+066B ARABIC DECIMAL SEPARATOR
    "$": "\ufdfc", // ﷼  U+FDFC RIAL SIGN
    "%": "\u066a", // ٪  U+066A ARABIC PERCENT SIGN
    "^": "\u00d7", // ×  U+00D7 MULTIPLICATION SIGN
    "&": "\u060c", // ،  U+060C ARABIC COMMA
    "*": "*", // *  U+002A ASTERISK
    "(": ")", // )  U+0029 RIGHT PARENTHESIS
    ")": "(", // (  U+0028 LEFT PARENTHESIS
    "_": "\u0640", // ـ  U+0640 ARABIC TATWEEL
    "+": "+", // +  U+002B PLUS SIGN
    "Q": "\u0652", // ◌ْ  U+0652 ARABIC SUKUN
    "W": "\u064c", // ◌ٌ  U+064C ARABIC DAMMATAN
    "E": "\u064d", // ◌ٍ  U+064D ARABIC KASRATAN
    "R": "\u064b", // ◌ً  U+064B ARABIC FATHATAN
    "T": "\u064f", // ◌ُ  U+064F ARABIC DAMMA
    "Y": "\u0650", // ◌ِ  U+0650 ARABIC KASRA
    "U": "\u064e", // ◌َ  U+064E ARABIC FATHA
    "I": "\u0651", // ◌ّ  U+0651 ARABIC SHADDA
    "O": "]", // ]  U+005D RIGHT SQUARE BRACKET
    "P": "[", // [  U+005B LEFT SQUARE BRACKET
    "{": "}", // }  U+007D RIGHT CURLY BRACKET
    "}": "{", // {  U+007B LEFT CURLY BRACKET
    "|": "|", // |  U+007C VERTICAL LINE
    "A": "\u0624", // ؤ  U+0624 ARABIC LETTER WAW WITH HAMZA ABOVE
    "S": "\u0626", // ئ  U+0626 ARABIC LETTER YEH WITH HAMZA ABOVE
    "D": "\u064a", // ي  U+064A ARABIC LETTER YEH. Arabic yeh
    "F": "\u0625", // إ  U+0625 ARABIC LETTER ALEF WITH HAMZA BELOW
    "G": "\u0623", // أ  U+0623 ARABIC LETTER ALEF WITH HAMZA ABOVE
    "H": "\u0622", // آ  U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE
    "J": "\u0629", // ة  U+0629 ARABIC LETTER TEH MARBUTA
    "K": "\u00bb", // »  U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
    "L": "\u00ab", // «  U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
    ":": ":", // :  U+003A COLON
    "\"": "\u061b", // ؛  U+061B ARABIC SEMICOLON
    "Z": "\u0643", // ك  U+0643 ARABIC LETTER KAF. Arabic kaf
    "X": "\u0653", // ◌ٓ  U+0653 ARABIC MADDAH ABOVE
    "C": "\u0698", // ژ  U+0698 ARABIC LETTER JEH
    "V": "\u0670", // ◌ٰ  U+0670 ARABIC LETTER SUPERSCRIPT ALEF
    "B": "\u200c", // U+200C ZERO WIDTH NON-JOINER. ZWNJ (also Shift+Space)
    "N": "\u0654", // ◌ٔ  U+0654 ARABIC HAMZA ABOVE
    "M": "\u0621", // ء  U+0621 ARABIC LETTER HAMZA
    "<": "<", // <  U+003C LESS-THAN SIGN
    ">": ">", // >  U+003E GREATER-THAN SIGN
    "?": "\u061f", // ؟  U+061F ARABIC QUESTION MARK
  },
  zwnjOnUs: " ",
};

/** The layouts the benchmark generates wrong-layout variants for. */
export const LAYOUTS: Layout[] = [ISIRI9147, WIN_LEGACY, MAC];

/**
 * The Persian string that appears when the user types the key sequence `text`
 * (written as the US characters on those keys) while the OS is on `layout`.
 * Example: latinToPersian("nd[d", isiri9147) === "دیجی".
 *
 * Characters that are not keys of the table (space, newline, non-ASCII) pass
 * through unchanged. A key that emits nothing on this layout is dropped.
 */
export function latinToPersian(text: string, layout: Layout): string {
  let out = "";
  for (const ch of text) {
    if (Object.hasOwn(layout.base, ch)) out += layout.base[ch];
    else if (Object.hasOwn(layout.shift, ch)) out += layout.shift[ch];
    else out += ch;
  }
  return out;
}

/**
 * The Latin string that appears when the user types the Persian `text` on the
 * keys of `layout` while the OS is on US. Example:
 * persianToLatin("دیجی", isiri9147) === "nd[d".
 *
 * Rules:
 * - Each character is typed on the key that produces it, base layer first,
 *   then shift; within one layer, the first key in table order.
 * - Keys that emit a multi-character ligature (Shift+4 «ریال» on Windows) or
 *   nothing at all are never used, so «ریال» is typed letter by letter.
 * - ZWNJ becomes `layout.zwnjOnUs` (a space, or nothing on legacy Windows).
 * - Characters no key produces (space, Latin letters, Arabic letters the
 *   layout lacks) pass through unchanged.
 */
export function persianToLatin(text: string, layout: Layout): string {
  const reverse = reverseTable(layout);
  let out = "";
  for (const ch of text) out += reverse.get(ch) ?? ch;
  return out;
}

const reverseCache = new WeakMap<Layout, Map<string, string>>();

/** Emitted character → US key character, built once per layout. */
function reverseTable(layout: Layout): Map<string, string> {
  const cached = reverseCache.get(layout);
  if (cached) return cached;
  const reverse = new Map<string, string>();
  for (const layer of [layout.base, layout.shift]) {
    // Object.keys() lists integer-like keys ("0"–"9") first; that only changes
    // which key wins for a character two keys of the same layer emit, and no
    // digit key shares its output with another key.
    for (const key of Object.keys(layer)) {
      const emitted = layer[key]!;
      if ([...emitted].length !== 1) continue; // ligature or "produces nothing"
      if (!reverse.has(emitted)) reverse.set(emitted, key);
    }
  }
  reverse.set(ZWNJ, layout.zwnjOnUs);
  reverseCache.set(layout, reverse);
  return reverse;
}
