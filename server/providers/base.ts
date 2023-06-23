import { Voice } from "../routes/apiTypes";

export default abstract class Provider {
  abstract name: string;
  voices: Voice[] = [];
  
  init(): Promise<void> | void {}
  
  abstract synthesise(voice: string, text: string): Promise<Buffer>;
}
