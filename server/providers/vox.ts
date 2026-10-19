import fs from "fs";
import path from "path";
import Provider from "./base";
import { Voice } from "../routes/apiTypes";
import HTTPError from "../helpers/HTTPError";
import { runFFmpeg } from "../helpers/ffmpeg";
import chalk from "chalk";

const SAMPLES_ROOT = "vox";
const WORD_REGEX = /(\w+|[.,-?!])/g;
const NULL_BUF = Buffer.alloc(0);

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.yellow("VOX") + chalk.bold("]"), ...params);
}

type Samples = Partial<Record<string, Partial<Record<string, Buffer>>>>;

export default class Vox extends Provider {
  name = "VOX";
  samples: Samples = {};
  
  async init() {
    const voices = await fs.promises.readdir(SAMPLES_ROOT);
  
    log(`Loading ${voices.length} voices...`);
    
    for(let voice of voices) {
      const voicePath = path.join(SAMPLES_ROOT, voice);
      const samples = await fs.promises.readdir(voicePath);
      const sampleBufs: Record<string, Buffer> = {};
      const voiceObj: Voice = {
        name: voice,
        language: "en-US",
        provider: "VOX",
        samples: [],
      };
      
      for(let sample of samples) {
        const samplePath = path.join(voicePath, sample);
        const sampleName = sample.split('.')
                                 .slice(0, -1)
                                 .join('.')
                                 .toLowerCase();
  
        const sampleBuf = await runFFmpeg([
          "-i", samplePath,
          "-vn",
          "-f", "s16le",
          "-c:a", "pcm_s16le",
          "-ac", "1",
          "-ar", "44100",
        ]);
  
        sampleBufs[sampleName] = sampleBuf.length ? sampleBuf : NULL_BUF;
        voiceObj.samples!.push(sampleName);
      }
  
      this.samples[voice] = sampleBufs;
      this.voices.push(voiceObj);
  
      log(`Loaded ${chalk.bold(voice)} (${samples.length} samples)`)
    }
    
    log(`Loading complete`);
  }
  
  async synthesise(voice: string, text: string): Promise<Buffer> {
    const samples = this.samples[voice];
    if(!samples) throw new HTTPError(400, `Unknown voice ${voice}`);
    
    const chunks: Buffer[] = [];
    
    for(const [word] of text.toLowerCase().matchAll(WORD_REGEX)) {
      const sample = samples[word];
      if(!sample) continue;
      
      chunks.push(sample);
    }
    
    return runFFmpeg([
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "1",
      "-i", "pipe:0",
      "-f", "wav",
      "-c:a", "pcm_s16le",
    ], Buffer.concat(chunks));
  }
}
