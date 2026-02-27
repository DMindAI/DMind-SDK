// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface ContentPartText {
  type: "text";
  text: string;
}

export interface ContentPartImage {
  type: "image_url";
  imageUrl: { url: string; detail?: "auto" | "low" | "high" };
}

export type ContentPart = ContentPartText | ContentPartImage;

export interface SystemMessage {
  role: "system";
  content: string;
  name?: string;
}

export interface DeveloperMessage {
  role: "developer";
  content: string;
  name?: string;
}

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
  name?: string;
}

export interface ChatAssistantMessage {
  role: "assistant";
  content?: string | null;
  toolCalls?: ChatToolCall[];
  reasoning?: string | null;
  refusal?: string | null;
}

export interface ChatToolMessage {
  role: "tool";
  toolCallId: string;
  content: string;
}

export type ChatMessage =
  | DeveloperMessage
  | SystemMessage
  | UserMessage
  | ChatAssistantMessage
  | ChatToolMessage;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export interface ChatToolCallFunction {
  name: string;
  arguments: string;
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: ChatToolCallFunction;
}

export interface ToolFunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunctionDefinition;
}

export type ToolChoiceOption =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

// ---------------------------------------------------------------------------
// Chat request
// ---------------------------------------------------------------------------

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  maxCompletionTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  seed?: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoiceOption;
  parallelToolCalls?: boolean;
  responseFormat?: { type: "text" | "json_object" };
}

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Non-streaming response
// ---------------------------------------------------------------------------

export interface ChatResponseChoice {
  index: number;
  message: ChatAssistantMessage;
  finishReason: string | null;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatResponseChoice[];
  usage?: TokenUsage;
}

// ---------------------------------------------------------------------------
// Streaming response
// ---------------------------------------------------------------------------

export interface ChatStreamingToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface ChatStreamingDelta {
  role?: "assistant";
  content?: string | null;
  toolCalls?: ChatStreamingToolCall[];
  reasoning?: string | null;
  refusal?: string | null;
}

export interface ChatStreamingChoice {
  index: number;
  delta: ChatStreamingDelta;
  finishReason: string | null;
}

export interface ChatStreamingChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatStreamingChoice[];
  usage?: TokenUsage;
}

// ---------------------------------------------------------------------------
// DMind options (unified)
// ---------------------------------------------------------------------------

import type { ModelGenerate, ModelProfile, ProtocolMode, ToolHandlers } from "./types";

export interface DMindOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultHeaders?: Record<string, string>;
  protocolMode?: ProtocolMode;
  modelGenerate?: ModelGenerate;
  tools?: ToolHandlers;
  modelProfile?: ModelProfile;
}
