import type { SDKErrorCode, ValidationIssue } from "./errors";

export type Role = "developer" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export type ProtocolMode = "official" | "dual" | "legacy";

export type ToolName = string;

export interface ToolCallResult {
  type: "tool_call";
  tool: ToolName;
  args: Record<string, any>;
  raw: string;
  protocol: "official" | "legacy";
}

export interface TextResult {
  type: "text";
  text: string;
  raw: string;
}

export interface ParseErrorResult {
  type: "parse_error";
  code: SDKErrorCode;
  message: string;
  raw: string;
}

export type ParsedResult = ToolCallResult | TextResult | ParseErrorResult;

export type BasicValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type DetailedValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationIssue[] };

export type ModelGenerate = (messages: Message[]) => Promise<string>;

export type ToolHandler = (args: Record<string, any>) => Promise<any> | any;

export type ToolHandlers = Partial<Record<ToolName, ToolHandler>>;

export interface FunctionCallSDK {
  generate(messages: Message[]): Promise<string>;
  parseAssistantOutput(raw: string, mode?: ProtocolMode): ParsedResult;
  validateToolCall(call: ToolCallResult): BasicValidationResult;
  executeTool(call: ToolCallResult): Promise<any>;
  wrapFunctionResponse(payload: any): string;
}

export interface FunctionCallInteropSDK extends FunctionCallSDK {
  parseDMindToOpenAIMessage(raw: string, mode?: ProtocolMode): OpenAIInteropResult;
  parseOpenAIToDMindRaw(
    message: OpenAIAssistantMessage,
    protocol?: DmindProtocol
  ): { type: "raw"; raw: string } | ParseErrorResult;
  wrapToolResponseAsOpenAI(toolCallId: string, payload: any): OpenAIToolMessage;
}

export interface FunctionCallSDKOptions {
  protocolMode?: ProtocolMode;
  modelGenerate?: ModelGenerate;
  tools?: ToolHandlers;
  modelProfile?: ModelProfile;
}

export interface RunToolLoopOptions {
  maxToolHops?: number;
  mode?: ProtocolMode;
  functionResponseRole?: Extract<Role, "user" | "assistant">;
}

export interface RunToolLoopResult {
  final: ParsedResult;
  messages: Message[];
  toolHops: number;
}

export interface ConvertToXmlResult {
  ok: true;
  xml: string;
}

export type DmindProtocol = "official" | "legacy";

export type ToolParameterType = "string" | "number" | "boolean" | "object";

export interface ToolParameterSchema {
  type: ToolParameterType;
  required?: boolean;
  nonEmpty?: boolean;
  enum?: Array<string | number | boolean>;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ToolSchema {
  parameters: Record<string, ToolParameterSchema>;
  strict?: boolean;
  customValidate?: (args: Record<string, any>) => ValidationIssue[];
}

export interface ModelProfile {
  id: string;
  tools: Record<string, ToolSchema>;
}

export interface ParseOptions {
  allowedTools?: Set<string>;
}

export interface InteropOptions {
  allowedTools?: Set<string>;
}

export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: OpenAIFunctionCall;
}

export interface OpenAIAssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export interface OpenAIChoiceLike {
  message: OpenAIAssistantMessage;
}

export interface OpenAICompletionLike {
  choices: OpenAIChoiceLike[];
}

export type InteropProtocol = "dmind_official" | "dmind_legacy" | "openai";

export type OpenAIInteropResult =
  | {
      type: "assistant_message";
      message: OpenAIAssistantMessage;
      protocol: InteropProtocol;
      raw: unknown;
    }
  | ParseErrorResult;
