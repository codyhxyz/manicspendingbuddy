// Type declarations for Chrome's built-in AI Prompt API (Gemini Nano)
// https://developer.chrome.com/docs/ai/built-in

interface AILanguageModelCapabilities {
  available: 'readily' | 'after-download' | 'no';
  defaultTopK?: number;
  maxTopK?: number;
  defaultTemperature?: number;
}

interface AILanguageModelCreateOptions {
  systemPrompt?: string;
  topK?: number;
  temperature?: number;
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

interface AICreateMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: AIDownloadProgressEvent) => void,
  ): void;
}

interface AIDownloadProgressEvent extends Event {
  loaded: number;
  total: number;
}

interface AILanguageModel {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal },
  ): ReadableStream<string>;
  destroy(): void;
}

interface AILanguageModelFactory {
  capabilities(): Promise<AILanguageModelCapabilities>;
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
}

interface AI {
  languageModel: AILanguageModelFactory;
}

// Available as `self.ai` in service workers and `window.ai` in page/content scripts
declare const ai: AI;
