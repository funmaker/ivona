import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import chalk from "chalk";
import HTTPError from "../helpers/HTTPError";
import { getTokenizer, JapaneseTokenizer } from "../helpers/japanese";
import Provider from "./base";

// AquesTalk10 library and the aquestalk helper, installed by aquestalk/setup.sh
const INSTALL_DIR = path.resolve(process.env.AQUESTALK_DIR || path.join("aquestalk", "install"));
const HELPER = path.join(INSTALL_DIR, "aquestalk");
const LIBRARY = path.join(INSTALL_DIR, "libAquesTalk10.so.1.1");

// Longest run of readings without a pause, longer phrases overflow AquesTalk's buffers
const MAX_PHRASE = 80;

interface AquesTalkVoice {
  name: string;
  // AQTK_VOICE fields, see AquesTalk.h
  bas: number;
  spd: number;
  vol: number;
  pit: number;
  acc: number;
  lmd: number;
  fsc: number;
}

// gVoice_F1 and gVoice_F2 presets
const VOICES: AquesTalkVoice[] = [
  { name: "Yukkuri 1", bas: 0, spd: 100, vol: 100, pit: 100, acc: 100, lmd: 100, fsc: 100 },
  { name: "Yukkuri 2", bas: 1, spd: 100, vol: 100, pit: 77, acc: 150, lmd: 100, fsc: 100 },
];

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.green("AquesTalk") + chalk.bold("]"), ...params);
}

// Punctuation AquesTalk accepts: 、 (pause), 。 (end of sentence) and ？ (question)
const PUNCTUATION: Record<string, string> = {
  "、": "、", ",": "、", ";": "、", ":": "、",
  "。": "。", ".": "。", "!": "。", "…": "。",
  "?": "？", "？": "？",
};

// Readings of symbols outside of latin text, from the specification's 記号読み表
const SYMBOLS: Record<string, string> = {
  "%": "ぱーせんと", "&": "あんど", "+": "ぷらす", "=": "いこーる", "@": "あっと",
  "#": "しゃーぷ", "$": "どる", "¥": "えん", "*": "あすた",
};

// Symbols that can appear inside of an <ALPHA> tag, eg. in e-mail addresses
const ALPHA_SYMBOLS = "@.-_+#&/:'";

// Every reading symbol (読み記号) AquesTalk knows, from the specification's 読み記号表
const MORAE = new Set([
  ..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっー",
  ..."がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ",
  ..."きしちにひみりぎじびぴ".split("").flatMap(c => ["ゃ", "ゅ", "ぇ", "ょ"].map(s => c + s)),
  "いぇ", "うぃ", "うぇ", "うぉ", "つぁ", "つぃ", "つぇ", "つぉ", "ふぁ", "ふぃ", "ふぇ", "ふぉ",
  "すぃ", "ずぃ", "てぃ", "でぃ", "とぅ", "どぅ", "てゅ", "でゅ",
]);

// Replacements for readings AquesTalk does not know
const MORA_FIXES: Record<string, string> = {
  ぢ: "じ", づ: "ず", ゔ: "ぶ", ゐ: "い", ゑ: "え", ゕ: "か", ゖ: "け", ゎ: "わ",
  ゔぁ: "ば", ゔぃ: "び", ゔぇ: "べ", ゔぉ: "ぼ", ゔゅ: "びゅ",
  ぢゃ: "じゃ", ぢゅ: "じゅ", ぢょ: "じょ",
};

const SMALL_KANA: Record<string, string> = { ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", ゃ: "や", ゅ: "ゆ", ょ: "よ" };

const isKana = (text: string) => /^[ぁ-ゖァ-ヺー]+$/.test(text);
const isDigits = (text: string) => /^[0-9]+$/.test(text);
const isAlnum = (text: string) => /^[A-Za-z0-9]+$/.test(text);
const isLatin = (text: string) => /^[A-Za-z0-9' ]+$/.test(text);
const isPunctuation = (text: string) => text.split("").every(char => PUNCTUATION[char]);

// Strongest mark in a run of punctuation, eg. "?!" is a question
function punctuationMark(text: string) {
  const marks = text.split("").map(char => PUNCTUATION[char]);
  return ["？", "。", "、"].find(mark => marks.includes(mark))!;
}

// Splits a reading into hiragana morae known to AquesTalk
function toMorae(reading: string): string[] {
  const hiragana = reading.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
                          .replace(/ヷ/g, "ば").replace(/ヸ/g, "び").replace(/ヹ/g, "べ").replace(/ヺ/g, "ぼ");
  const morae: string[] = [];
  
  for(const [mora] of hiragana.matchAll(/[^ぁぃぅぇぉゃゅょゎ][ぁぃぅぇぉゃゅょ]?|./g)) {
    const fixed = MORA_FIXES[mora] || mora;
    if(MORAE.has(fixed)) {
      morae.push(fixed);
    } else {
      // Unknown combination or a lone small kana, eg. くぉ -> くお, ぁ -> あ
      for(const char of fixed) {
        const big = SMALL_KANA[char] || MORA_FIXES[char] || char;
        if(MORAE.has(big)) morae.push(big);
      }
    }
  }
  
  return morae;
}

// Converts arbitrary text into an AquesTalk phonetic symbol string (音声記号列): readings in
// hiragana, numbers and latin text as reading tags, and only the punctuation AquesTalk accepts.
export function toKoe(tokenizer: JapaneseTokenizer, text: string): string {
  const tokens = tokenizer.tokenize(text.normalize("NFKC"));
  let koe = "";
  let phrase = 0;
  let last = "";
  
  const pause = (mark: string) => {
    if(phrase === 0) return; // AquesTalk rejects leading and repeated punctuation
    if(last === "っ") koe = koe.slice(0, -1); // and っ before punctuation
    koe += mark;
    phrase = 0;
    last = mark;
  };
  
  // Tags can't be split
  const sayTag = (tag: string, length: number) => {
    if(phrase + length > MAX_PHRASE) pause("、");
    koe += tag;
    phrase += length;
    last = ">";
  };
  
  // A phrase can't start with ー or っ, and ー or っ can't follow っ
  const canPauseBefore = (mora: string) => mora !== "ー" && mora !== "っ" && mora !== "ん" && last !== "っ";
  
  // Prefer pausing between words, but split words that don't fit on their own
  const sayKana = (reading: string) => {
    const morae = toMorae(reading);
    if(morae.length === 0) return;
    if(phrase > 0 && phrase + morae.length > MAX_PHRASE && canPauseBefore(morae[0])) pause("、");
    
    for(const mora of morae) {
      if(phrase >= MAX_PHRASE && canPauseBefore(mora)) pause("、");
      if((mora === "ー" || mora === "っ") && (phrase === 0 || last === "っ" || last === ">")) continue;
      koe += mora;
      phrase += mora.length;
      last = mora;
    }
  };
  
  for(let i = 0; i < tokens.length; i++) {
    const surface = tokens[i].surface_form;
    const next = (offset = 1) => tokens[i + offset]?.surface_form ?? "";
    
    if(isPunctuation(surface)) {
      pause(punctuationMark(surface));
    } else if(isDigits(surface)) {
      // Join decimals and thousands separators: 3.14, 1,000
      let number = surface;
      for(;;) {
        if(next() === "." && isDigits(next(2)) && !number.includes(".")) number += "." + next(2);
        else if(next() === "," && /^[0-9]{3}$/.test(next(2)) && !number.includes(".")) number += next(2);
        else break;
        i += 2;
      }
      sayTag(`<NUMK VAL=${number}>`, number.length * 2);
    } else if(/[A-Za-z]/.test(surface) && isLatin(surface)) {
      // Join neighbouring latin words and the symbols between them into one tag
      let latin = surface;
      for(;;) {
        let j = i + 1;
        while(j < tokens.length && tokens[j].surface_form.split("").every(char => ALPHA_SYMBOLS.includes(char))) j++;
        if(j >= tokens.length || !(isLatin(tokens[j].surface_form) && (j === i + 1 || isAlnum(tokens[j].surface_form)))) break;
        for(i++; i <= j; i++) latin += tokens[i].surface_form;
        i--;
      }
      latin = latin.trim().replace(/\s+/g, " ");
      sayTag(`<ALPHA VAL="${latin}">`, latin.length);
    } else if(SYMBOLS[surface]) {
      sayKana(SYMBOLS[surface]);
    } else {
      const reading = tokens[i].pronunciation || surface;
      if(isKana(reading)) sayKana(reading); // Anything else (unknown kanji, symbols, emoji) is skipped
    }
  }
  
  if(last === "っ") koe = koe.slice(0, -1);
  
  return koe;
}

function runHelper(voice: AquesTalkVoice, koe: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { bas, spd, vol, pit, acc, lmd, fsc } = voice;
    const proc = spawn(HELPER, [bas, spd, vol, pit, acc, lmd, fsc].map(String), {
      env: {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        AQUESTALK_LIB: LIBRARY,
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let finished = false;
    
    const fail = (err: Error) => {
      if(finished) return;
      finished = true;
      reject(err);
    };
    
    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    proc.stdin.on("error", fail);
    
    proc.on("error", err => fail(
      new Error(`Failed to start aquestalk (${HELPER}): ${err.message}`),
    ));
    
    proc.on("close", code => {
      if(finished) return;
      finished = true;
      
      if(code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      
      const details = Buffer.concat(stderr).toString().trim();
      if(details.includes("synthesis failed")) reject(new HTTPError(400, details));
      else reject(new Error(`aquestalk exited with code ${code}${details ? `: ${details}` : ""}`));
    });
    
    proc.stdin.end(koe);
  });
}

export default class AquesTalk extends Provider {
  name = "AquesTalk";
  tokenizer: JapaneseTokenizer | null = null;
  
  async init() {
    for(const file of [HELPER, LIBRARY]) {
      if(!fs.existsSync(file)) throw new Error(`${file} not found, run aquestalk/setup.sh first.`);
    }
    
    this.tokenizer = await getTokenizer();
    
    if(!process.env.AQUESTALK_DEV_KEY) log(`No ${chalk.bold("AQUESTALK_DEV_KEY")} set, running the evaluation version (ナ and マ rows are spoken as ヌ)`);
    
    this.voices = VOICES.map(({ name }) => ({
      name,
      language: "ja-JP",
      provider: this.name,
    }));
    
    log(`Loaded ${this.voices.length} voices`);
  }
  
  async synthesise(voice: string, text: string): Promise<Buffer> {
    const params = VOICES.find(v => v.name === voice);
    if(!params) throw new HTTPError(400, `Unknown voice ${voice}`);
    if(!this.tokenizer) throw new HTTPError(503, "AquesTalk is not initialized yet");
    
    const koe = toKoe(this.tokenizer, text);
    if(!koe) throw new HTTPError(400, "Nothing to say");
    
    return runHelper(params, koe);
  }
}
