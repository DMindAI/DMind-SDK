import { SDKError } from "./errors";
import {
  type ChatAssistantMessage,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ChatResponseChoice,
  type ChatStreamingChunk,
  type ChatStreamingChoice,
  type ChatStreamingDelta,
  type ChatStreamingToolCall,
  type ChatToolCall,
  type ContentPart,
  type DMindOptions,
  type TokenUsage,
  type ToolChoiceOption,
  type ToolDefinition,
} from "./chat-types";

// ---------------------------------------------------------------------------
// camelCase -> snake_case request serialization
// ---------------------------------------------------------------------------

function serializeContentPart(part: ContentPart): Record<string, unknown> {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  return {
    type: "image_url",
    image_url: { url: part.imageUrl.url, detail: part.imageUrl.detail },
  };
}

function serializeToolCall(tc: ChatToolCall): Record<string, unknown> {
  return {
    id: tc.id,
    type: tc.type,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  };
}

function serializeMessage(msg: ChatMessage): Record<string, unknown> {
  switch (msg.role) {
    case "system":
      return { role: "system", content: msg.content, ...(msg.name && { name: msg.name }) };
    case "user": {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map(serializeContentPart);
      return { role: "user", content, ...(msg.name && { name: msg.name }) };
    }
    case "assistant": {
      const out: Record<string, unknown> = { role: "assistant" };
      if (msg.content !== undefined) out.content = msg.content;
      if (msg.toolCalls?.length) out.tool_calls = msg.toolCalls.map(serializeToolCall);
      if (msg.reasoning !== undefined) out.reasoning = msg.reasoning;
      if (msg.refusal !== undefined) out.refusal = msg.refusal;
      return out;
    }
    case "tool":
      return { role: "tool", tool_call_id: msg.toolCallId, content: msg.content };
  }
}

function serializeToolDef(def: ToolDefinition): Record<string, unknown> {
  return {
    type: def.type,
    function: {
      name: def.function.name,
      ...(def.function.description && { description: def.function.description }),
      ...(def.function.parameters && { parameters: def.function.parameters }),
      ...(def.function.strict !== undefined && { strict: def.function.strict }),
    },
  };
}

function serializeToolChoice(choice: ToolChoiceOption): unknown {
  if (typeof choice === "string") return choice;
  return { type: choice.type, function: { name: choice.function.name } };
}

function buildRequestBody(request: ChatRequest, defaultModel?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages.map(serializeMessage),
  };

  const model = request.model ?? defaultModel;
  if (model) body.model = model;
  if (request.stream !== undefined) body.stream = request.stream;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.maxCompletionTokens !== undefined)
    body.max_completion_tokens = request.maxCompletionTokens;
  if (request.topP !== undefined) body.top_p = request.topP;
  if (request.frequencyPenalty !== undefined) body.frequency_penalty = request.frequencyPenalty;
  if (request.presencePenalty !== undefined) body.presence_penalty = request.presencePenalty;
  if (request.stop !== undefined) body.stop = request.stop;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.tools?.length) body.tools = request.tools.map(serializeToolDef);
  if (request.toolChoice !== undefined) body.tool_choice = serializeToolChoice(request.toolChoice);
  if (request.parallelToolCalls !== undefined)
    body.parallel_tool_calls = request.parallelToolCalls;
  if (request.responseFormat !== undefined) body.response_format = request.responseFormat;

  return body;
}

// ---------------------------------------------------------------------------
// snake_case -> camelCase response deserialization
// ---------------------------------------------------------------------------

function parseToolCall(raw: any): ChatToolCall {
  return {
    id: raw.id,
    type: raw.type ?? "function",
    function: { name: raw.function.name, arguments: raw.function.arguments },
  };
}

function parseAssistantMessage(raw: any): ChatAssistantMessage {
  const msg: ChatAssistantMessage = { role: "assistant" };
  if (raw.content !== undefined) msg.content = raw.content;
  if (raw.tool_calls?.length) msg.toolCalls = raw.tool_calls.map(parseToolCall);
  if (raw.reasoning !== undefined) msg.reasoning = raw.reasoning;
  if (raw.refusal !== undefined) msg.refusal = raw.refusal;
  return msg;
}

function parseUsage(raw: any): TokenUsage | undefined {
  if (!raw) return undefined;
  return {
    completionTokens: raw.completion_tokens ?? 0,
    promptTokens: raw.prompt_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
}

function parseChoice(raw: any): ChatResponseChoice {
  return {
    index: raw.index ?? 0,
    message: parseAssistantMessage(raw.message ?? {}),
    finishReason: raw.finish_reason ?? null,
  };
}

function parseChatResponse(raw: any): ChatResponse {
  return {
    id: raw.id ?? "",
    object: "chat.completion",
    created: raw.created ?? 0,
    model: raw.model ?? "",
    choices: (raw.choices ?? []).map(parseChoice),
    usage: parseUsage(raw.usage),
  };
}

function parseStreamingToolCall(raw: any): ChatStreamingToolCall {
  const tc: ChatStreamingToolCall = { index: raw.index ?? 0 };
  if (raw.id !== undefined) tc.id = raw.id;
  if (raw.type !== undefined) tc.type = raw.type;
  if (raw.function) {
    tc.function = {};
    if (raw.function.name !== undefined) tc.function.name = raw.function.name;
    if (raw.function.arguments !== undefined) tc.function.arguments = raw.function.arguments;
  }
  return tc;
}

function parseStreamingDelta(raw: any): ChatStreamingDelta {
  const delta: ChatStreamingDelta = {};
  if (raw.role !== undefined) delta.role = raw.role;
  if (raw.content !== undefined) delta.content = raw.content;
  if (raw.tool_calls?.length) delta.toolCalls = raw.tool_calls.map(parseStreamingToolCall);
  if (raw.reasoning !== undefined) delta.reasoning = raw.reasoning;
  if (raw.refusal !== undefined) delta.refusal = raw.refusal;
  return delta;
}

function parseStreamingChoice(raw: any): ChatStreamingChoice {
  return {
    index: raw.index ?? 0,
    delta: parseStreamingDelta(raw.delta ?? {}),
    finishReason: raw.finish_reason ?? null,
  };
}

function parseStreamingChunk(raw: any): ChatStreamingChunk {
  return {
    id: raw.id ?? "",
    object: "chat.completion.chunk",
    created: raw.created ?? 0,
    model: raw.model ?? "",
    choices: (raw.choices ?? []).map(parseStreamingChoice),
    usage: parseUsage(raw.usage),
  };
}

// ---------------------------------------------------------------------------
// SSE async iterator
// ---------------------------------------------------------------------------

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ChatStreamingChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice("data:".length).trim();
          if (payload === "[DONE]") return;

          try {
            yield parseStreamingChunk(JSON.parse(payload));
          } catch {
            // skip malformed JSON chunks
          }
        }
      }
    }

    if (buffer.trim().startsWith("data:")) {
      const payload = buffer.trim().slice("data:".length).trim();
      if (payload && payload !== "[DONE]") {
        try {
          yield parseStreamingChunk(JSON.parse(payload));
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Chat class
// ---------------------------------------------------------------------------

export class Chat {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel?: string;
  private readonly defaultHeaders: Record<string, string>;

  /** @internal Created internally by the DMind constructor. */
  constructor(options: DMindOptions) {
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.defaultModel = options.defaultModel;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async send(request: ChatRequest & { stream?: false }): Promise<ChatResponse>;
  async send(
    request: ChatRequest & { stream: true },
  ): Promise<AsyncIterable<ChatStreamingChunk>>;
  async send(
    request: ChatRequest,
  ): Promise<ChatResponse | AsyncIterable<ChatStreamingChunk>>;
  async send(
    request: ChatRequest,
  ): Promise<ChatResponse | AsyncIterable<ChatStreamingChunk>> {
    const body = buildRequestBody(request, this.defaultModel);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.defaultHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail: unknown;
      try {
        detail = await response.json();
      } catch {
        detail = await response.text().catch(() => null);
      }
      throw new SDKError(
        "E_RUNTIME",
        `Chat API returned ${response.status}: ${response.statusText}`,
        detail,
      );
    }

    if (request.stream) {
      if (!response.body) {
        throw new SDKError("E_RUNTIME", "Streaming response has no body.");
      }
      return parseSSEStream(response.body);
    }

    const json = await response.json();
    return parseChatResponse(json);
  }
}
