import type {
  SDKCore,
  Message,
  ParsedResult,
  RunLoopOptions,
  RunLoopResult
} from "./types";

function toParseError(raw: string, message: string): ParsedResult {
  return {
    type: "parse_error",
    code: "E_INVOKE_COUNT",
    message,
    raw
  };
}

export async function runLoop(
  sdk: SDKCore,
  messages: Message[],
  options: RunLoopOptions = {}
): Promise<RunLoopResult> {
  const mode = options.mode;
  const maxToolHops = options.maxToolHops ?? 3;
  const functionResponseRole = options.functionResponseRole ?? "user";
  const history = [...messages];

  let toolHops = 0;

  while (true) {
    const raw = await sdk.generate(history);
    history.push({ role: "assistant", content: raw });
    const parsed = sdk.parse(raw, mode);

    if (parsed.type !== "tool_call") {
      return { final: parsed, messages: history, toolHops };
    }

    if (toolHops >= maxToolHops) {
      return {
        final: toParseError(
          raw,
          `Tool call count exceeds maxToolHops=${maxToolHops}.`
        ),
        messages: history,
        toolHops
      };
    }

    const validation = sdk.validate(parsed);
    if (!validation.ok) {
      return {
        final: {
          type: "parse_error",
          code: "E_PARAM_INVALID",
          message: validation.errors.join("; "),
          raw
        },
        messages: history,
        toolHops
      };
    }

    const result = await sdk.execute(parsed);
    const payload = sdk.wrapResponse({ status: "ok", result });
    history.push({
      role: functionResponseRole,
      content: payload
    });
    toolHops += 1;
  }
}
