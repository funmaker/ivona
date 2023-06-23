import PromiseRouter from "express-promise-router";
import { LanguageRequest, LanguageResponse, ListResponse, TTSRequest } from "./apiTypes";
import * as speech from "../controllers/speech";
import HTTPError from "../helpers/HTTPError";
import html from '../views/index.handlebars';

export const router = PromiseRouter();

router.get<never, any, any, TTSRequest>("/tts", async (req, res) => {
  const { text, voice, language, provider } = req.query;
  if(!text) throw new HTTPError(400, "Missing `text` paramater.")
  
  const wav = await speech.synthesise(req.query.text, { voice, language, provider });
  
  res.setHeader('Content-disposition', 'attachment; filename=speak.wav');
  res.setHeader('Content-Type', 'audio/wav');
  res.end(wav);
});

router.get<never, ListResponse, any, any>("/list", async (req, res) => {
  const voices = await speech.listVoices();
  
  res.json(voices);
})


router.get<never, LanguageResponse, any, LanguageRequest>("/language", async (req, res) => {
  res.json({
    results: []
  });
})

router.get<never, any, any, Partial<TTSRequest>>("/", async (req, res) => {
  const { text, voice: selectedVoice } = req.query;
  const voices = await speech.listVoices();
  const searchIdx = req.originalUrl.indexOf("?");
  const search = searchIdx >= 0 && req.originalUrl.substr(searchIdx + 1);
  
  res.send(html({
    voices: voices.map(voice => ({
      ...voice,
      selected: voice.name.toLowerCase().includes((selectedVoice || "").toLowerCase()),
    })).sort((a, b) => a.language.localeCompare(b.language)),
    text: text || "",
    audioSrc: search ? `tts?${search}` : "",
  }))
})
