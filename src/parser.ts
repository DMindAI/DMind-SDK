import {
  LEGACY_END,
  LEGACY_START,
  OFFICIAL_END,
  OFFICIAL_START
} from "./constants";
import type { ParseOptions, ParsedResult, ProtocolMode, ToolCallResult } from "./types";
import { makeParseError, isPlainObject, parseLooseXmlValue } from "./utils";

const OFFICIAL_BLOCK_RE = /<start_function_call>([\s\S]*?)<end_function_call>/g;
const LEGACY_BLOCK_RE = /<function_calls>([\s\S]*?)<\/function_calls>/g;
const LEGACY_INVOKE_RE = /<invoke\s+name=(?:"([^"]+)"|'([^']+)')\s*>([\s\S]*?)<\/invoke>/g;
const LEGACY_PARAM_RE =
  /<parameter\s+name=(?:"([^"]+)"|'([^']+)')\s*>([\s\S]*?)<\/parameter>/g;

function parseOfficialPayload(
  payload: string,
  raw: string,
  options: ParseOptions = {}
): ParsedResult {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("call:")) {
    return makeParseError(
      "E_JSON_INVALID",
      "Official function call must start with `call:`.",
      raw
    );
  }

  const body = trimmed.slice("call:".length);
  const jsonIndex = body.indexOf("{");
  if (jsonIndex < 0) {
    return makeParseError(
      "E_JSON_INVALID",
      "Official function call payload is missing JSON args.",
      raw
    );
  }

  const tool = body.slice(0, jsonIndex).trim();
  const argsText = body.slice(jsonIndex).trim();

  if (tool.length === 0) {
    return makeParseError("E_PARAM_MISSING", "Tool name is missing.", raw);
  }

  if (options.allowedTools && !options.allowedTools.has(tool)) {
    return makeParseError("E_TOOL_UNKNOWN", `Unknown tool: ${tool}.`, raw);
  }

  let args: unknown;
  try {
    args = JSON.parse(argsText);
  } catch (error) {
    return makeParseError(
      "E_JSON_INVALID",
      `Failed to parse tool args JSON: ${(error as Error).message}`,
      raw
    );
  }

  if (!isPlainObject(args)) {
    return makeParseError("E_JSON_INVALID", "Tool args must be a JSON object.", raw);
  }

  return {
    type: "tool_call",
    tool,
    args,
    raw,
    protocol: "official"
  };
}

function parseLegacyPayload(
  payload: string,
  raw: string,
  options: ParseOptions = {}
): ParsedResult {
  const invokeMatches = [...payload.matchAll(LEGACY_INVOKE_RE)];
  if (invokeMatches.length !== 1) {
    return makeParseError(
      "E_INVOKE_COUNT",
      `Legacy payload must contain exactly 1 invoke node, got ${invokeMatches.length}.`,
      raw
    );
  }

  const [, dqName, sqName, invokeBody] = invokeMatches[0];
  const tool = (dqName ?? sqName ?? "").trim();
  if (tool.length === 0) {
    return makeParseError("E_PARAM_MISSING", "Tool name is missing.", raw);
  }
  if (options.allowedTools && !options.allowedTools.has(tool)) {
    return makeParseError("E_TOOL_UNKNOWN", `Unknown tool: ${tool}.`, raw);
  }

  const args: Record<string, any> = {};
  for (const paramMatch of invokeBody.matchAll(LEGACY_PARAM_RE)) {
    const [, dqParamName, sqParamName, paramValue] = paramMatch;
    const key = (dqParamName ?? sqParamName ?? "").trim();
    if (!key) {
      continue;
    }
    args[key] = parseLooseXmlValue(paramValue);
  }

  return {
    type: "tool_call",
    tool,
    args,
    raw,
    protocol: "legacy"
  };
}

function parseOfficial(raw: string, options: ParseOptions = {}): ParsedResult {
  const matches = [...raw.matchAll(OFFICIAL_BLOCK_RE)];
  if (matches.length === 0) {
    if (
      raw.includes("call:") ||
      raw.includes(OFFICIAL_START) ||
      raw.includes(OFFICIAL_END)
    ) {
      return makeParseError(
        "E_NO_WRAPPER",
        "Function call content detected but official wrapper is missing.",
        raw
      );
    }
    return { type: "text", text: raw, raw };
  }

  if (matches.length !== 1) {
    return makeParseError(
      "E_INVOKE_COUNT",
      `Official mode expects exactly 1 function call block, got ${matches.length}.`,
      raw
    );
  }

  const [match] = matches;
  const outside = raw.replace(match[0], "").trim();
  if (outside.length > 0) {
    return makeParseError(
      "E_WRONG_PROTOCOL",
      "Official function-call output cannot mix wrapper with extra text.",
      raw
    );
  }

  return parseOfficialPayload(match[1], raw, options);
}

function parseLegacy(raw: string, options: ParseOptions = {}): ParsedResult {
  const matches = [...raw.matchAll(LEGACY_BLOCK_RE)];
  if (matches.length === 0) {
    if (
      raw.includes(LEGACY_START) ||
      raw.includes(LEGACY_END) ||
      raw.includes("<invoke")
    ) {
      return makeParseError(
        "E_NO_WRAPPER",
        "Legacy function call tags detected but wrapper is incomplete.",
        raw
      );
    }
    return { type: "text", text: raw, raw };
  }

  if (matches.length !== 1) {
    return makeParseError(
      "E_INVOKE_COUNT",
      `Legacy mode expects exactly 1 function_calls block, got ${matches.length}.`,
      raw
    );
  }

  const [match] = matches;
  const outside = raw.replace(match[0], "").trim();
  if (outside.length > 0) {
    return makeParseError(
      "E_WRONG_PROTOCOL",
      "Legacy function-call output cannot mix wrapper with extra text.",
      raw
    );
  }

  return parseLegacyPayload(match[1], raw, options);
}

function hasLegacyTags(raw: string): boolean {
  return (
    raw.includes(LEGACY_START) || raw.includes(LEGACY_END) || raw.includes("<invoke")
  );
}

function hasOfficialTags(raw: string): boolean {
  return (
    raw.includes(OFFICIAL_START) || raw.includes(OFFICIAL_END) || raw.includes("call:")
  );
}

export function parseAssistantOutput(
  raw: string,
  mode: ProtocolMode = "official",
  options: ParseOptions = {}
): ParsedResult {
  if (mode === "official") {
    if (hasLegacyTags(raw)) {
      return makeParseError(
        "E_WRONG_PROTOCOL",
        "Legacy protocol tags detected in official mode.",
        raw
      );
    }
    return parseOfficial(raw, options);
  }

  if (mode === "legacy") {
    if (hasOfficialTags(raw)) {
      return makeParseError(
        "E_WRONG_PROTOCOL",
        "Official protocol tags detected in legacy mode.",
        raw
      );
    }
    return parseLegacy(raw, options);
  }

  const officialCandidate = parseOfficial(raw, options);
  if (officialCandidate.type === "tool_call") {
    return officialCandidate;
  }
  if (
    officialCandidate.type === "parse_error" &&
    officialCandidate.code !== "E_NO_WRAPPER"
  ) {
    return officialCandidate;
  }

  const legacyCandidate = parseLegacy(raw, options);
  if (legacyCandidate.type === "tool_call") {
    return legacyCandidate;
  }
  if (
    legacyCandidate.type === "parse_error" &&
    legacyCandidate.code !== "E_NO_WRAPPER"
  ) {
    return legacyCandidate;
  }

  if (hasOfficialTags(raw) || hasLegacyTags(raw)) {
    return makeParseError(
      "E_NO_WRAPPER",
      "Function call-like content detected but no valid wrapper found.",
      raw
    );
  }

  return { type: "text", text: raw, raw };
}

export function parseOfficialToToolCall(
  raw: string,
  options: ParseOptions = {}
): ToolCallResult | ParsedResult {
  const parsed = parseAssistantOutput(raw, "official", options);
  if (parsed.type !== "tool_call") {
    return parsed;
  }
  return parsed;
}
