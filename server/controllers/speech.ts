import crypto from "crypto";
import path from "path";
import fs from "fs";
import LanguageDetect from "languagedetect";
import HTTPError from "../helpers/HTTPError";
import Provider from "../providers/base";
import Sapi5 from "../providers/sapi5";
import Vox from "../providers/vox";
import chalk from "chalk";

fs.mkdirSync("./tmp", { recursive: true });
fs.mkdirSync("./cache", { recursive: true });

const fileExists = (path: string) => fs.promises.stat(path).then(() => true).catch(() => false);

const langDetector = new LanguageDetect();
langDetector.setLanguageType("iso2");

export const providers = [
  process.platform === "win32" && new Sapi5(),
  new Vox(),
].filter(x => !!x) as Provider[];

providers.forEach(async provider => {
  try {
    await new Promise(res => setImmediate(res));
    
    log(`Initializing ${provider.name}...`);
    await provider.init();
    log(`${provider.name} has been initialized`);
  } catch(e) {
    log(`${provider.name} errored during initialization.`);
    console.error(e);
  }
});

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.whiteBright("Core") + chalk.bold("]"), ...params);
}

export async function listVoices() {
  return providers.map(provider => provider.voices).flat();
}

interface SynthesiseOptions {
  voice?: string;
  language?: string;
  provider?: string;
}

export async function synthesise(text: string, { voice, language, provider }: SynthesiseOptions) {
  const voices = await listVoices();
  
  if(provider && !providers.find(p => p.name.toLowerCase().includes(provider.toLowerCase()))) throw new HTTPError(400, `Provider ${provider} does not exists.`);
  if(language && !voices.find(v => v.language.toLowerCase().startsWith(language!.toLowerCase()))) throw new HTTPError(400, `Language ${language} is not supported.`);
  
  if(!voice && !provider && !language) {
    for(const [detected] of langDetector.detect(text)) {
      if(voices.some(voice => voice.language.toLowerCase().startsWith(detected))) {
        language = detected;
        break;
      }
    }
    
    if(!language || language === "pl") voice = "Jan";
  }
  
  let foundVoice = voices.find(fv => (!voice    || fv.name.toLowerCase().includes(voice.toLowerCase()))
                                  && (!provider || fv.provider.toLowerCase().includes(provider.toLowerCase()))
                                  && (!language || fv.language.toLowerCase().startsWith(language.toLowerCase())));
  
  if(!foundVoice) throw new HTTPError(400, `Unknown voice: ${voice}`);
  
  const hash = crypto.createHash('md5').update(foundVoice.provider).update(foundVoice.name).update(text).digest('hex');
  const cachePath = path.join("cache", hash + ".wav");
  
  console.log(foundVoice.name + ": " + text);
  
  if(await fileExists(cachePath)) {
    return await fs.promises.readFile(cachePath);
  }
  
  const providerObj = providers.find(p => p.name === foundVoice?.provider)!;
  const wav = await providerObj.synthesise(foundVoice.name, text);
  
  await fs.promises.writeFile(cachePath, wav);
  
  return wav;
}
