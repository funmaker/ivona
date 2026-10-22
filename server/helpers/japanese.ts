import path from "path";
import kuromoji, { IpadicFeatures, Tokenizer } from "kuromoji";
import { toKatakana, toRomaji } from "wanakana";

const DICT_PATH = path.resolve(process.env.KUROMOJI_DICT || path.join("node_modules", "kuromoji", "dict"));

export type JapaneseTokenizer = Tokenizer<IpadicFeatures>;

let tokenizer: Promise<JapaneseTokenizer> | null = null;

// Shared kuromoji tokenizer, its dictionary is loaded on first use
export function getTokenizer(): Promise<JapaneseTokenizer> {
  if(!tokenizer) {
    tokenizer = new Promise<JapaneseTokenizer>((resolve, reject) => {
      kuromoji.builder({ dicPath: DICT_PATH }).build((err, built) => err ? reject(err) : resolve(built));
    });
    tokenizer.catch(() => { tokenizer = null; });
  }
  
  return tokenizer;
}

export const hasJapanese = (text: string) => /[぀-ヿ㐀-䶿一-鿿豈-﫿々〆]/.test(text);
const isKana = (text: string) => /^[ぁ-ゖァ-ヺー]+$/.test(text);

const PUNCTUATION: Record<string, string> = {
  "、": ",", "。": ".", "・": " ", "「": "\"", "」": "\"", "『": "\"", "』": "\"", "〜": "~",
};

// Loanword morae wanakana romanizes poorly (eg. ティ -> teii)
const LOANWORDS: Array<[RegExp, string]> = [
  [/ティ/g, "ti"], [/ディ/g, "di"], [/トゥ/g, "tu"], [/ドゥ/g, "du"],
  [/ヴァ/g, "va"], [/ヴィ/g, "vi"], [/ヴェ/g, "ve"], [/ヴォ/g, "vo"], [/ヴ/g, "vu"],
  [/ウィ/g, "wi"], [/ウェ/g, "we"], [/ウォ/g, "wo"],
];

// Long vowels for romaji meant to be read by an English voice: no macrons or doubled vowels.
// In native words ー after e is usually written ei (センセー -> sensei), in loanwords it is dropped (メートル -> metoru).
function longVowels(kana: string, loanword: boolean) {
  const katakana = toKatakana(kana).replace(/ヲ/g, "オ"); // The particle を is pronounced o
  return (loanword ? katakana : katakana.replace(/(?<=[エケセテネヘメレゲゼデベペェ])ー/g, "イ")).replace(/ー/g, "");
}

function kanaToRomaji(katakana: string) {
  for(const [from, to] of LOANWORDS) katakana = katakana.replace(from, to);
  return toRomaji(katakana);
}

// Tokens that are part of the previous word, eg. the て in して or the ます in します, but not です
function isSuffix(token: IpadicFeatures, prev: IpadicFeatures) {
  if(["接続助詞", "非自立", "接尾"].includes(token.pos_detail_1)) return true;
  return token.pos === "助動詞" && ["動詞", "助動詞"].includes(prev.pos) && !["です", "だ"].includes(token.basic_form);
}

// Converts the Japanese parts of a text into romaji, leaving the rest as is
export function romanize(tokenizer: JapaneseTokenizer, text: string): string {
  let normalized = text.normalize("NFKC");
  for(const [from, to] of Object.entries(PUNCTUATION)) normalized = normalized.split(from).join(to);
  
  let out = "";
  let word = ""; // Katakana of the current word, romanized as a whole so a trailing っ is kept
  let prev: IpadicFeatures | null = null;
  
  const separate = () => {
    if(out && !/[\s"(]$/.test(out)) out += " ";
  };
  
  const flush = () => {
    if(!word) return;
    separate();
    out += kanaToRomaji(word);
    word = "";
  };
  
  for(const token of tokenizer.tokenize(normalized)) {
    const surface = token.surface_form;
    
    if(!hasJapanese(surface)) {
      flush();
      if(/^[A-Za-z0-9]/.test(surface)) separate();
      out += surface;
      prev = null;
      continue;
    }
    
    const reading = token.pronunciation || (isKana(surface) ? surface : null);
    if(!reading || !isKana(reading)) continue; // Unknown kanji and symbols
    
    if(!(word && prev && isSuffix(token, prev))) flush();
    word += longVowels(reading, /^[ァ-ヺー]+$/.test(surface));
    prev = token;
  }
  
  flush();
  return out.replace(/ +/g, " ").trim();
}
