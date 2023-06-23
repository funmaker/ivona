import path from "path";
import say from "say";
import fsPromises from "fs/promises";
import Provider from "./base";
import { v4 as uuid } from "uuid";
import chalk from "chalk";

const BOM = "\uFEFF";

const languages: Record<string, string> = {
  "IVONA 2 Filiz": "tr-TR",
  "IVONA 2 Carla": "it-IT",
  "IVONA 2 Giorgio": "it-IT",
  "IVONA 2 Chantal": "fr-CA",
  "IVONA 2 Raveena": "en-IN",
  "IVONA 2 Tatyana": "ru-RU",
  "IVONA 2 Astrid": "sv-SE",
  "IVONA 2 Vitória": "pt-BR",
  "IVONA 2 Ricardo": "pt-BR",
  "IVONA 2 Ruben": "nl-BE",
  "IVONA 2 Lotte": "nl-BE",
  "IVONA 2 Cristiano": "pt-PT",
  "IVONA 2 Carmen": "ro-RO",
  "IVONA 2 Karl": "is-IS",
  "IVONA 2 Dóra": "is-IS",
  "IVONA 2 Mads": "da-DK",
  "IVONA 2 Naja": "da-DK",
  "IVONA 2 Hans": "de-DE",
  "IVONA 2 Marlene": "de-DE",
  "IVONA 2 Miguel": "es-US",
  "IVONA 2 Penélope": "es-US",
  "IVONA 2 Ewa": "pl-PL",
  "IVONA 2 Jacek": "pl-PL",
  "IVONA 2 Maja": "pl-PL",
  "IVONA 2 Jan": "pl-PL",
  "IVONA 2 Agnieszka": "pl-PL",
  "IVONA 2 Emma": "en-GB",
  "IVONA 2 Amy": "en-GB",
  "IVONA 2 Brian": "en-GB",
  "IVONA 2 Gwyneth": "cy-GB",
  "IVONA 2 Geraint": "cy-GB",
  "IVONA 2 Nicole": "en-AU",
  "IVONA 2 Russell": "en-AU",
  "IVONA 2 Jennifer": "en-US",
  "IVONA 2 Kendra": "en-US",
  "IVONA 2 Ivy": "en-US",
  "IVONA 2 Kimberly": "en-US",
  "IVONA 2 Salli": "en-US",
  "IVONA 2 Eric": "en-US",
  "IVONA 2 Joey": "en-US",
  "IVONA 2 Skippy the Chipmunk": "en-US",
  "IVONA 2 Conchita": "es-ES",
  "IVONA 2 Enrique": "es-ES",
  "IVONA 2 Céline": "fr-FR",
  "IVONA 2 Mathieu": "fr-FR",
  "Microsoft Anna": "en-US",
  "Microsoft Sam": "en-US",
};

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.blue("Sapi5") + chalk.bold("]"), ...params);
}

export default class Sapi5 extends Provider {
  name = "Sapi5";
  
  async init() {
    const voices = await say.getInstalledVoices();
  
    this.voices = voices.map(voice => voice.replace(BOM, ''))
                        .map(voice => ({
                          name: voice,
                          language: languages[voice],
                          provider: "Sapi5",
                        }));
    
    log(`Loaded ${this.voices.length} voices`);
  }
  
  async synthesise(voice: string, text: string) {
    const id = uuid();
    const pathname = path.join("tmp", id + ".wav");
    
    await say.export(text, voice, 1.0, pathname);
    
    const buffer = await fsPromises.readFile(pathname);
    
    await fsPromises.unlink(pathname);
    
    return buffer;
  }
}
