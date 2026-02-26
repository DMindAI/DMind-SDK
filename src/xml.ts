import type { ParseErrorResult, ToolCallResult } from "./types";
import { parseOfficialToToolCall } from "./parser";
import { encodeXml } from "./utils";

function serializeValue(value: any): string {
  if (typeof value === "string") {
    return encodeXml(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  return encodeXml(JSON.stringify(value));
}

export function toolCallToLegacyXml(call: ToolCallResult): string {
  const params = Object.entries(call.args)
    .map(
      ([name, value]) =>
        `<parameter name="${encodeXml(name)}">${serializeValue(value)}</parameter>`
    )
    .join("");
  return `<function_calls><invoke name="${call.tool}">${params}</invoke></function_calls>`;
}

export function convertOfficialRawToLegacyXml(
  raw: string
): { ok: true; xml: string } | { ok: false; error: ParseErrorResult } {
  const parsed = parseOfficialToToolCall(raw);
  if (parsed.type !== "tool_call") {
    if (parsed.type === "parse_error") {
      return { ok: false, error: parsed };
    }
    return {
      ok: false,
      error: {
        type: "parse_error",
        code: "E_NO_WRAPPER",
        message: "Input is text; no official function call found.",
        raw
      }
    };
  }

  return {
    ok: true,
    xml: toolCallToLegacyXml(parsed)
  };
}

