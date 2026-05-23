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

type ResponseInputMessage = {
  content: string;
  role: "assistant" | "developer" | "user";
};

type ResponseRequest = {
  input: ResponseInputMessage[];
  model: string;
  temperature?: number;
  tool_choice?: { type: "image_generation" };
  tools?: Array<{ type: "image_generation" }>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      images?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

type ModelResponse = {
  error?: {
    message?: unknown;
  };
  output?: unknown;
  output_text?: unknown;
};

type ModelsResponse = {
  data?: Array<{
    id?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

export type AiResponseMedia = {
  alt: string;
  src: string;
};

export type AiChatCompletion = {
  media: AiResponseMedia[];
  text: string;
};

export type CreateChatCompletionOptions = {
  messages: readonly AiChatMessage[];
  settings: AiSettingsSnapshot;
  signal: AbortSignal;
  temperature?: number;
};

export type CreateModelResponseOptions = CreateChatCompletionOptions & {
  imageGeneration?: boolean;
  imageGenerationRequired?: boolean;
};

export async function createOpenAiCompatibleChatCompletion({
  messages,
  settings,
  signal,
  temperature,
}: CreateChatCompletionOptions): Promise<AiChatCompletion> {
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
  const completion = normalizeCompletionContent(content, payload?.choices?.[0]?.message?.images);
  if (completion.text === "" && completion.media.length === 0) {
    throw new Error("AI response did not include message content or media.");
  }

  return completion;
}

export async function createOpenAiCompatibleModelResponse({
  imageGeneration = false,
  imageGenerationRequired = false,
  messages,
  settings,
  signal,
  temperature,
}: CreateModelResponseOptions): Promise<AiChatCompletion> {
  const response = await fetch(`${settings.baseUrl}/responses`, {
    body: JSON.stringify(
      createResponseRequestBody(
        settings.model,
        messages,
        temperature,
        imageGeneration,
        imageGenerationRequired,
      ),
    ),
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  const payload = (await response.json().catch(() => null)) as ModelResponse | null;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) ?? `AI response failed with ${response.status}.`);
  }

  const completion = normalizeModelResponse(payload);
  if (completion.text === "" && completion.media.length === 0) {
    throw new Error("AI response did not include message content or media.");
  }

  return completion;
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

function createResponseRequestBody(
  model: string,
  messages: readonly AiChatMessage[],
  temperature: number | undefined,
  imageGeneration: boolean,
  imageGenerationRequired: boolean,
): ResponseRequest {
  const body: ResponseRequest = {
    input: messages.map(toResponseInputMessage),
    model,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (imageGeneration) {
    body.tools = [{ type: "image_generation" }];
    if (imageGenerationRequired) body.tool_choice = { type: "image_generation" };
  }
  return body;
}

function toResponseInputMessage(message: AiChatMessage): ResponseInputMessage {
  return {
    content: message.content,
    role: message.role === "system" ? "developer" : message.role,
  };
}

function getApiErrorMessage(
  payload: ChatCompletionResponse | ModelResponse | ModelsResponse | null,
): string | null {
  const message = payload?.error?.message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

function normalizeModelResponse(payload: ModelResponse | null): AiChatCompletion {
  const outputText = typeof payload?.output_text === "string" ? payload.output_text.trim() : "";
  const collectedText = collectText(payload?.output).join("\n").trim();
  return {
    media: collectMedia(payload?.output),
    text: outputText || collectedText,
  };
}

function normalizeCompletionContent(content: unknown, images: unknown): AiChatCompletion {
  if (typeof content === "string") {
    return {
      media: collectMedia(images),
      text: content.trim(),
    };
  }

  if (!Array.isArray(content)) {
    return {
      media: collectMedia(images),
      text: "",
    };
  }

  const text: string[] = [];
  const media: AiResponseMedia[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      text.push(part);
      continue;
    }
    if (!isRecord(part)) continue;

    const partText = getStringProperty(part, "text", "content");
    if (partText) text.push(partText);
    media.push(...collectMedia(part));
  }

  media.push(...collectMedia(images));
  return {
    media,
    text: text.join("\n").trim(),
  };
}

function collectText(value: unknown): string[] {
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (!isRecord(value)) return [];

  const type = getStringProperty(value, "type")?.toLowerCase();
  const text = getStringProperty(value, "text", "content");
  const current =
    text && (!type || type === "output_text" || type === "text" || type === "message")
      ? [text]
      : [];

  return current.concat(collectText(value.content), collectText(value.output));
}

function collectMedia(value: unknown): AiResponseMedia[] {
  if (Array.isArray(value)) return value.flatMap(collectMedia);
  if (!isRecord(value)) return [];

  const src = getImageSource(value);
  const current = src
    ? [{ alt: getStringProperty(value, "alt", "caption", "title") ?? "", src }]
    : [];
  return current.concat(
    collectMedia(value.content),
    collectMedia(value.image),
    collectMedia(value.image_url),
    collectMedia(value.media),
    collectMedia(value.output),
  );
}

function getImageSource(record: Record<string, unknown>): string | null {
  const type = getStringProperty(record, "type")?.toLowerCase() ?? "";
  if (type.includes("image")) {
    const result = getStringProperty(record, "result");
    if (result) return normalizeImageData(result, "image/png");
  }

  const direct = getStringProperty(record, "url", "src", "href", "imageUrl", "image_url", "image");
  if (direct) return direct;

  const base64 = getStringProperty(record, "b64_json", "base64", "data");
  if (!base64) return null;

  const mimeType = getStringProperty(record, "mime_type", "media_type", "mimeType") ?? "image/png";
  return normalizeImageData(base64, mimeType);
}

function normalizeImageData(value: string, mimeType: string): string {
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `data:${mimeType};base64,${value}`;
}

function getStringProperty(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
