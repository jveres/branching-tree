import { reactive } from "@arrow-js/core";
import { listOpenAiCompatibleModels } from "./ai-client";

export type AiSettingsSnapshot = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type PersistedAiSettings = {
  apiKey?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  version?: unknown;
};

export type AiSettingsStore = AiSettingsSnapshot & {
  modelListLoading: boolean;
  modelListStatus: string;
  modelOptions: string[];
  settingsOpen: boolean;
  systemInstruction: string;
};

const STORAGE_KEY = "branching-tree:ai-settings:v1";
const STORAGE_VERSION = 1;
export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_AI_MODEL = "gpt-4o-mini";
export const DEFAULT_AI_SYSTEM_INSTRUCTION =
  'You generate answer alternatives for an expanding exploration tree. Use the conversation path as context. Each answer round must explain the latest user question in both text and image: create at least one text explanation and one image explanation. Create 2 to 4 meaningfully different versions. Every version must have a distinct title, distinct framing, and a distinct tradeoff or next step; do not create near-duplicate titles or lightly reworded copies. Text versions must return JSON text shaped as {"type":"text","title":"short label","content":"full answer","score":85}. Image versions must use the image_generation tool to create actual image media in the same response and also return JSON text shaped as {"type":"image","title":"short label","content":"short accessible description","score":85}. Never return an image prompt as a substitute for image media.';

const initialSettings = readAiSettings();
let modelListController: AbortController | null = null;

export const aiSettingsStore = reactive<AiSettingsStore>({
  ...initialSettings,
  modelListLoading: false,
  modelListStatus: "",
  modelOptions: [initialSettings.model],
  settingsOpen: false,
  systemInstruction: DEFAULT_AI_SYSTEM_INSTRUCTION,
});

export function openAiSettings(): void {
  aiSettingsStore.settingsOpen = true;
}

export function closeAiSettings(): void {
  aiSettingsStore.settingsOpen = false;
  void refreshAiModelList();
}

export function setAiApiKey(apiKey: string): void {
  aiSettingsStore.apiKey = apiKey;
  persistAiSettings();
}

export function setAiBaseUrl(baseUrl: string): void {
  aiSettingsStore.baseUrl = baseUrl;
  persistAiSettings();
}

export function setAiModel(model: string): void {
  aiSettingsStore.model = model;
  aiSettingsStore.modelOptions = mergeModelOptions(aiSettingsStore.modelOptions, model);
  persistAiSettings();
}

export function getAiSettingsSnapshot(): AiSettingsSnapshot {
  return {
    apiKey: aiSettingsStore.apiKey.trim(),
    baseUrl: normalizeBaseUrl(aiSettingsStore.baseUrl),
    model: aiSettingsStore.model.trim(),
  };
}

export function hasConfiguredAiSettings(settings = getAiSettingsSnapshot()): boolean {
  return settings.apiKey !== "" && settings.baseUrl !== "" && settings.model !== "";
}

export async function refreshAiModelList(): Promise<void> {
  const settings = getAiSettingsSnapshot();
  modelListController?.abort();

  if (settings.apiKey === "" || settings.baseUrl === "") {
    aiSettingsStore.modelListLoading = false;
    aiSettingsStore.modelListStatus = "Add an API key and base URL to load models.";
    aiSettingsStore.modelOptions = settings.model ? [settings.model] : [];
    return;
  }

  const controller = new AbortController();
  modelListController = controller;
  aiSettingsStore.modelListLoading = true;
  aiSettingsStore.modelListStatus = "Loading models...";

  try {
    const models = await listOpenAiCompatibleModels(settings, controller.signal);
    if (modelListController !== controller) return;

    aiSettingsStore.modelOptions = models;
    if (!models.includes(settings.model)) setAiModel(models[0]!);
    aiSettingsStore.modelListStatus = `${models.length} models loaded.`;
  } catch (error) {
    if (controller.signal.aborted) return;

    aiSettingsStore.modelOptions = settings.model ? [settings.model] : [];
    aiSettingsStore.modelListStatus = getErrorMessage(error);
  } finally {
    if (modelListController === controller) {
      aiSettingsStore.modelListLoading = false;
      modelListController = null;
    }
  }
}

export function getAiSettingsStatus(): string {
  const settings = getAiSettingsSnapshot();
  if (!hasConfiguredAiSettings(settings)) {
    return "Simulated responses. Add an API key to use an OpenAI-compatible endpoint.";
  }

  return `Using ${settings.model} via ${settings.baseUrl}`;
}

function readAiSettings(): AiSettingsSnapshot {
  const fallback = {
    apiKey: "",
    baseUrl: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
  };
  const storage = getLocalStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as PersistedAiSettings;
    if (parsed.version !== STORAGE_VERSION) return fallback;

    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : fallback.apiKey,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : fallback.baseUrl,
      model: typeof parsed.model === "string" ? parsed.model : fallback.model,
    };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return fallback;
  }
}

function persistAiSettings(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        apiKey: aiSettingsStore.apiKey,
        baseUrl: aiSettingsStore.baseUrl,
        model: aiSettingsStore.model,
      }),
    );
  } catch {
    // localStorage is optional for the demo.
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function mergeModelOptions(options: readonly string[], model: string): string[] {
  const normalized = model.trim();
  if (normalized === "" || options.includes(normalized)) return [...options];
  return [normalized, ...options];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "Could not load models.";
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
