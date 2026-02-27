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

export interface SDKCore {
  generate(messages: Message[]): Promise<string>;
  parse(raw: string, mode?: ProtocolMode): ParsedResult;
  validate(call: ToolCallResult): BasicValidationResult;
  execute(call: ToolCallResult): Promise<any>;
  wrapResponse(payload: any): string;
}

export interface RunLoopOptions {
  maxToolHops?: number;
  mode?: ProtocolMode;
  functionResponseRole?: Extract<Role, "user" | "assistant">;
}

export interface RunLoopResult {
  final: ParsedResult;
  messages: Message[];
  toolHops: number;
}

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

export interface DeveloperPromptPolicy {
  canonicalPrompt: string;
  requiredSnippets?: string[];
}

export interface ModelProfile {
  id: string;
  tools: Record<string, ToolSchema>;
  developerPromptPolicy?: DeveloperPromptPolicy;
}

export interface ParseOptions {
  allowedTools?: Set<string>;
}
