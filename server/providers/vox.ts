import fs from "fs";
import path from "path";
import Provider from "./base";
import ffmpeg from "fluent-ffmpeg";
import { ReadableStreamBuffer, WritableStreamBuffer } from "stream-buffers";
import { Voice } from "../routes/apiTypes";
import HTTPError from "../helpers/HTTPError";
import chalk from "chalk";

const SAMPLES_ROOT = "vox";
const BIN_ROOT = "bin";
const WORD_REGEX = /(\w+|[.,-?!])/g;
const NULL_BUF = Buffer.alloc(0);

declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    runPromise: () => Promise<void>;
  }
}

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.yellow("VOX") + chalk.bold("]"), ...params);
}

function ffmpegCmd() {
  let cmd = ffmpeg();
  
  if(process.platform === "win32") {
    cmd = cmd.setFfmpegPath(path.join(BIN_ROOT, "ffmpeg.exe"))
             .setFfprobePath(path.join(BIN_ROOT, "ffprobe.exe"));
  }
  
  cmd.runPromise = () => new Promise((res, rej) => {
    cmd.on("end", res)
       .on("error", rej)
       .run();
  });
  
  return cmd;
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
        const outStream = new WritableStreamBuffer();
        const sampleName = sample.split('.')
                                 .slice(0, -1)
                                 .join('.')
                                 .toLowerCase();
  
        await ffmpegCmd().input(samplePath)
                         .format("s16le")
                         .audioCodec("pcm_s16le")
                         .audioChannels(1)
                         .outputOptions("-ar 44100")
                         .output(outStream, { end: true })
                         .runPromise();
  
        sampleBufs[sampleName] = outStream.getContents() || NULL_BUF;
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
    
    const inStream = new ReadableStreamBuffer();
    const outStream = new WritableStreamBuffer();
    
    for(const [word] of text.toLowerCase().matchAll(WORD_REGEX)) {
      const sample = samples[word];
      if(!sample) continue;
      
      inStream.put(sample);
    }
  
    inStream.stop();
    
    await ffmpegCmd().input(inStream)
                     .inputFormat('s16le')
                     .inputOptions("-ar 44100")
                     .audioChannels(1)
                     .format("wav")
                     .output(outStream, { end: true })
                     .runPromise();
    
    return outStream.getContents() || NULL_BUF;
  }
}
