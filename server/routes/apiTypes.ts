export interface Voice {
  name: string;
  language: string;
  provider: string;
  samples?: string[];
}

export interface ErrorResponse {
  code: number;
  message: string;
  stack?: string;
}

export interface TTSRequest {
  language?: string;
  provider?: string;
  voice?: string;
  text: string;
}

export interface LanguageRequest {
  text: string;
}

export interface LanguageResponse {
  results: Array<[string, number]>;
}

export interface ListResponse extends Array<Voice> {}
