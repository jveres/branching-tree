import type { AiSettingsSnapshot } from "./ai-settings";

export type AiChatMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

type ChatCompletionRequest = {
  messages: readonly AiChatMessage[];
  model: string;
  temperature?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

type ModelsResponse = {
  data?: Array<{
    id?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

export type CreateChatCompletionOptions = {
  messages: readonly AiChatMessage[];
  settings: AiSettingsSnapshot;
  signal: AbortSignal;
  temperature?: number;
};

export async function createOpenAiCompatibleChatCompletion({
  messages,
  settings,
  signal,
  temperature,
}: CreateChatCompletionOptions): Promise<string> {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    body: JSON.stringify(createRequestBody(settings.model, messages, temperature)),
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) ?? `AI request failed with ${response.status}.`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("AI response did not include message content.");
  }

  return content;
}

export async function listOpenAiCompatibleModels(
  settings: AiSettingsSnapshot,
  signal: AbortSignal,
): Promise<string[]> {
  const response = await fetch(`${settings.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
    method: "GET",
    signal,
  });

  const payload = (await response.json().catch(() => null)) as ModelsResponse | null;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) ?? `Model list failed with ${response.status}.`);
  }

  const models = payload?.data
    ?.map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .map((id) => id.trim())
    .sort((left, right) => left.localeCompare(right));

  if (!models || models.length === 0) throw new Error("Model list response was empty.");
  return models;
}

function createRequestBody(
  model: string,
  messages: readonly AiChatMessage[],
  temperature?: number,
): ChatCompletionRequest {
  const body: ChatCompletionRequest = {
    model,
    messages,
  };
  if (temperature !== undefined) body.temperature = temperature;
  return body;
}

function getApiErrorMessage(
  payload: ChatCompletionResponse | ModelsResponse | null,
): string | null {
  const message = payload?.error?.message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}
