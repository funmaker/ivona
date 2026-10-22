import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import chalk from "chalk";
import { v4 as uuid } from "uuid";
import HTTPError from "../helpers/HTTPError";
import { getTokenizer, hasJapanese, romanize } from "../helpers/japanese";
import Provider from "./base";

// Wine prefix with SAPI 4, TruVoice and the sapi4.exe helper, created by sapi4/setup.sh
const PREFIX = path.resolve(process.env.SAPI4_PREFIX || path.join("sapi4", "prefix"));
const WINE = process.env.WINE_BIN || "wine";
const WINESERVER = process.env.WINESERVER_BIN || WINE.replace(/wine$/, "wineserver");
const HELPER = "C:\\sapi4.exe";

interface Sapi4Voice {
  name: string;
  mode: string;
  pitch: number;
  speed: number;
}

const VOICES: Sapi4Voice[] = [
  {
    name: "BonziBuddy",
    mode: "Adult Male #2, American English (TruVoice)",
    pitch: 140,
    speed: 157,
  },
  {
    name: "Microsoft Sam",
    mode: "Sam",
    pitch: 100,
    speed: 150,
  },
];

function log(...params: any[]) {
  console.log(chalk.bold("[") + chalk.bold.magenta("Sapi4") + chalk.bold("]"), ...params);
}

const wineEnv = () => ({
  ...process.env,
  /* eslint-disable @typescript-eslint/naming-convention */
  WINEPREFIX: PREFIX,
  WINEDEBUG: "-all",
  /* eslint-enable @typescript-eslint/naming-convention */
});

function spawnDetached(command: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    spawn(command, args, { env: wineEnv(), stdio: "ignore" })
      .on("error", err => reject(new Error(`Failed to start ${command}: ${err.message}`)))
      .on("exit", code => resolve(code));
  });
}

// Starts a persistent wineserver (no-op if one is already running),
// so requests don't pay for its startup.
const startServer = () => spawnDetached(WINESERVER, ["-p"]);

// The first process in a fresh wineserver session starts wine's background services, which
// inherit its stdio and keep the pipes open for as long as wineserver lives. Boot them here,
// without stdio. Should wineserver restart later, `speak` still works, as it only waits for exit.
async function bootPrefix() {
  await startServer();
  await spawnDetached(WINE, ["wineboot"]);
}

const toWinePath = (unixPath: string) => "Z:" + path.resolve(unixPath).replace(/\//g, "\\");

// Resolves with stdout once the helper exits, or once its stdio closes if `waitForStdio` is set
async function runHelper(args: string[], input = "", waitForStdio = false): Promise<Buffer> {
  await startServer();
  
  return new Promise((resolve, reject) => {
    const proc = spawn(WINE, [HELPER, ...args], {
      env: wineEnv(),
      windowsHide: true,
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
      new Error(`Failed to start wine (${WINE}): ${err.message}`),
    ));
    
    proc.on(waitForStdio ? "close" : "exit", (code: number | null) => {
      if(finished) return;
      finished = true;
      
      if(code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      
      // Only keep the helper's own messages, wine and its graphics stack are noisy
      const details = Buffer.concat(stderr).toString()
                                           .split("\n")
                                           .filter(line => line.startsWith("sapi4"))
                                           .join("\n");
      reject(new Error(`sapi4.exe exited with code ${code}${details ? `: ${details}` : ""}`));
    });
    
    proc.stdin.end(input);
  });
}

export default class Sapi4 extends Provider {
  name = "Sapi4";
  
  async init() {
    if(!fs.existsSync(path.join(PREFIX, "drive_c", "sapi4.exe"))) {
      throw new Error(`SAPI4 Wine prefix not found in ${PREFIX}, run sapi4/setup.sh first.`);
    }
    
    await bootPrefix();
    
    const installed = (await runHelper(["list"], "", true)).toString()
                                                   .split("\n")
                                                   .map(line => line.split("\t")[0].trim());
    
    for(const { name, mode } of VOICES) {
      if(!installed.includes(mode)) {
        log(`Skipping ${chalk.bold(name)}, ${mode} is not installed`);
        continue;
      }
      
      this.voices.push({
        name,
        language: "en-US",
        provider: this.name,
      });
    }
    
    log(`Loaded ${this.voices.length} voices`);
  }
  
  async synthesise(voice: string, text: string): Promise<Buffer> {
    const params = VOICES.find(v => v.name === voice);
    if(!params) throw new HTTPError(400, `Unknown voice ${voice}`);
    
    // TruVoice only speaks English, so read Japanese out as romaji
    if(hasJapanese(text)) text = romanize(await getTokenizer(), text);
    
    const output = path.join("tmp", uuid() + ".wav");
    
    try {
      await runHelper(["speak", params.mode, String(params.pitch), String(params.speed), toWinePath(output)], text);
      return await fs.promises.readFile(output);
    } finally {
      await fs.promises.unlink(output).catch(() => {});
    }
  }
}
