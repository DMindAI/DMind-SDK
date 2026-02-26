import { parseAssistantOutput } from "./parser";
import type {
  DmindProtocol,
  InteropOptions,
  OpenAIAssistantMessage,
  OpenAICompletionLike,
  OpenAIInteropResult,
  OpenAIToolCall,
  OpenAIToolMessage,
  ParseErrorResult,
  ProtocolMode,
  ToolCallResult
} from "./types";
import { toolCallToLegacyXml } from "./xml";
import { isPlainObject, makeParseError } from "./utils";

function stableHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function buildToolCallId(tool: string, argsText: string): string {
  return `call_${tool.toLowerCase()}_${stableHash(`${tool}:${argsText}`)}`;
}

function dmindToolCallToOpenAIMessage(
  call: ToolCallResult,
  raw: string
): OpenAIInteropResult {
  const argsText = JSON.stringify(call.args);
  return {
    type: "assistant_message",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: buildToolCallId(call.tool, argsText),
          type: "function",
          function: {
            name: call.tool,
            arguments: argsText
          }
        }
      ]
    },
    protocol: call.protocol === "official" ? "dmind_official" : "dmind_legacy",
    raw
  };
}

function ensureOpenAIMessageShape(message: unknown): message is OpenAIAssistantMessage {
  if (!isPlainObject(message)) {
    return false;
  }
  if (message.role !== "assistant") {
    return false;
  }
  const content = message.content;
  if (content !== null && typeof content !== "string") {
    return false;
  }
  if (
    message.tool_calls !== undefined &&
    !Array.isArray(message.tool_calls)
  ) {
    return false;
  }
  return true;
}

function parseToolArgs(argumentsRaw: unknown): Record<string, any> | ParseErrorResult {
  if (isPlainObject(argumentsRaw)) {
    return argumentsRaw;
  }

  if (typeof argumentsRaw !== "string") {
    return makeParseError(
      "E_JSON_INVALID",
      "OpenAI tool call `function.arguments` must be a JSON string.",
      JSON.stringify(argumentsRaw ?? null)
    );
  }

  const text = argumentsRaw.trim();
  if (text.length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return makeParseError(
      "E_JSON_INVALID",
      `OpenAI tool call arguments JSON parse failed: ${(error as Error).message}`,
      argumentsRaw
    );
  }

  if (!isPlainObject(parsed)) {
    return makeParseError(
      "E_JSON_INVALID",
      "OpenAI tool call arguments must decode to a JSON object.",
      argumentsRaw
    );
  }

  return parsed;
}

function openAIToolCallToToolCallResult(
  call: OpenAIToolCall,
  raw: unknown,
  options: InteropOptions = {}
): ToolCallResult | ParseErrorResult {
  if (call.type !== "function" || !call.function) {
    return makeParseError(
      "E_PARAM_INVALID",
      "OpenAI tool call must be type=function with function payload.",
      JSON.stringify(raw)
    );
  }

  const name = call.function.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    return makeParseError(
      "E_PARAM_MISSING",
      "OpenAI tool call missing function.name.",
      JSON.stringify(raw)
    );
  }
  if (options.allowedTools && !options.allowedTools.has(name)) {
    return makeParseError("E_TOOL_UNKNOWN", `Unknown tool: ${name}.`, JSON.stringify(raw));
  }

  const argsOrError = parseToolArgs(call.function.arguments);
  if (
    isPlainObject(argsOrError) &&
    "type" in argsOrError &&
    argsOrError.type === "parse_error"
  ) {
    return argsOrError as ParseErrorResult;
  }

  const args = argsOrError as Record<string, any>;

  return {
    type: "tool_call",
    tool: name,
    args,
    raw: JSON.stringify(raw),
    protocol: "official"
  };
}

export function dmindRawToOpenAIMessage(
  raw: string,
  mode: ProtocolMode = "official",
  options: InteropOptions = {}
): OpenAIInteropResult {
  const parsed = parseAssistantOutput(raw, mode, options);

  if (parsed.type === "parse_error") {
    return parsed;
  }

  if (parsed.type === "text") {
    return {
      type: "assistant_message",
      message: { role: "assistant", content: parsed.text },
      protocol: "dmind_official",
      raw
    };
  }

  return dmindToolCallToOpenAIMessage(parsed, raw);
}

export function normalizeAssistantOutputToOpenAI(
  input: string | OpenAIAssistantMessage | OpenAICompletionLike,
  mode: ProtocolMode = "official",
  options: InteropOptions = {}
): OpenAIInteropResult {
  if (typeof input === "string") {
    return dmindRawToOpenAIMessage(input, mode, options);
  }

  if (isPlainObject(input) && Array.isArray((input as any).choices)) {
    const completion = input as OpenAICompletionLike;
    const message = completion.choices[0]?.message;
    if (!message) {
      return makeParseError(
        "E_PARAM_MISSING",
        "OpenAI completion choices[0].message is missing.",
        JSON.stringify(input)
      );
    }
    input = message;
  }

  if (!ensureOpenAIMessageShape(input)) {
    return makeParseError(
      "E_PARAM_INVALID",
      "Input does not match OpenAI assistant message shape.",
      JSON.stringify(input)
    );
  }

  return {
    type: "assistant_message",
    message: input,
    protocol: "openai",
    raw: input
  };
}

export function openAIAssistantMessageToDMindRaw(
  message: OpenAIAssistantMessage,
  protocol: DmindProtocol = "official",
  options: InteropOptions = {}
): { type: "raw"; raw: string } | ParseErrorResult {
  const normalized = normalizeAssistantOutputToOpenAI(message, "official", options);
  if (normalized.type === "parse_error") {
    return normalized;
  }

  const toolCalls = normalized.message.tool_calls ?? [];
  const content = normalized.message.content ?? "";

  if (toolCalls.length === 0) {
    return { type: "raw", raw: content };
  }

  if (toolCalls.length !== 1) {
    return makeParseError(
      "E_INVOKE_COUNT",
      `DMind protocol only supports exactly 1 tool call, got ${toolCalls.length}.`,
      JSON.stringify(message)
    );
  }

  if (content.trim().length > 0) {
    return makeParseError(
      "E_WRONG_PROTOCOL",
      "DMind tool-call output cannot mix text content with tool_calls.",
      JSON.stringify(message)
    );
  }

  const parsedCall = openAIToolCallToToolCallResult(toolCalls[0], message, options);
  if (parsedCall.type === "parse_error") {
    return parsedCall;
  }

  if (protocol === "official") {
    return {
      type: "raw",
      raw: `<start_function_call>call:${parsedCall.tool}${JSON.stringify(parsedCall.args)}<end_function_call>`
    };
  }

  return {
    type: "raw",
    raw: toolCallToLegacyXml(parsedCall)
  };
}

export function openAIToolResultMessage(
  toolCallId: string,
  payload: any
): OpenAIToolMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: JSON.stringify(payload)
  };
}
