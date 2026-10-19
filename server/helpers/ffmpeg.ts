import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegStatic from "ffmpeg-static";

const BIN_ROOT = "bin";

let resolvedPath: string | null = null;

function existingPath(candidate: string | null): string | null {
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

export function getFFmpegPath(): string {
  if(resolvedPath) return resolvedPath;
  
  if(process.env.FFMPEG_BIN) {
    resolvedPath = process.env.FFMPEG_BIN;
  } else if(process.platform === "win32") {
    resolvedPath = existingPath(path.join(BIN_ROOT, "ffmpeg.exe"))
      || existingPath(ffmpegStatic)
      || "ffmpeg";
  } else {
    resolvedPath = existingPath(ffmpegStatic) || "ffmpeg";
  }
  
  return resolvedPath;
}

export function runFFmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // This helper always returns the media through stdout instead of a file
    const proc = spawn(getFFmpegPath(), [
      "-hide_banner", "-loglevel", "error",
      ...args,
      "pipe:1",
    ], {
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
      new Error(`Failed to start ffmpeg (${getFFmpegPath()}): ${err.message}`),
    ));
    
    proc.on("close", code => {
      if(finished) return;
      finished = true;
      
      if(code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      
      const details = Buffer.concat(stderr).toString().trim();
      reject(new Error(`ffmpeg exited with code ${code}${details ? `: ${details}` : ""}`));
    });
    
    if(input) {
      proc.stdin.end(input);
    } else {
      proc.stdin.end();
    }
  });
}
