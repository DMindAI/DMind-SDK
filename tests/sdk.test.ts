import { describe, expect, it } from "vitest";
import {
  DMind,
  DMIND_3_NANO_DEVELOPER_PROMPT,
  runLoop,
  type ModelProfile
} from "../src";

describe("DMind parser", () => {
  it("parses official protocol tool call", () => {
    const sdk = new DMind();
    const raw =
      '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC","chain":"ethereum"}<end_function_call>';
    const parsed = sdk.parse(raw, "official");

    expect(parsed).toEqual({
      type: "tool_call",
      tool: "SEARCH_TOKEN",
      args: { symbol: "USDC", chain: "ethereum" },
      raw,
      protocol: "official"
    });
  });

  it("returns text when no protocol content exists", () => {
    const sdk = new DMind();
    const raw = "How much SOL would you like to swap?";
    const parsed = sdk.parse(raw, "official");
    expect(parsed).toEqual({ type: "text", text: raw, raw });
  });

  it("returns E_NO_WRAPPER for wrapper-less call string", () => {
    const sdk = new DMind();
    const raw = 'call:SEARCH_TOKEN{"symbol":"USDC"}';
    const parsed = sdk.parse(raw, "official");

    expect(parsed.type).toBe("parse_error");
    if (parsed.type === "parse_error") {
      expect(parsed.code).toBe("E_NO_WRAPPER");
    }
  });

  it("returns E_WRONG_PROTOCOL when legacy tags appear in official mode", () => {
    const sdk = new DMind();
    const raw =
      '<function_calls><invoke name="SEARCH_TOKEN"><parameter name="symbol">USDC</parameter></invoke></function_calls>';
    const parsed = sdk.parse(raw, "official");

    expect(parsed.type).toBe("parse_error");
    if (parsed.type === "parse_error") {
      expect(parsed.code).toBe("E_WRONG_PROTOCOL");
    }
  });

  it("supports legacy format in dual mode", () => {
    const sdk = new DMind();
    const raw =
      '<function_calls><invoke name="EXECUTE_SWAP"><parameter name="inputTokenSymbol">SOL</parameter><parameter name="inputTokenPercentage">0.3</parameter></invoke></function_calls>';
    const parsed = sdk.parse(raw, "dual");

    expect(parsed.type).toBe("tool_call");
    if (parsed.type === "tool_call") {
      expect(parsed.tool).toBe("EXECUTE_SWAP");
      expect(parsed.args.inputTokenSymbol).toBe("SOL");
      expect(parsed.args.inputTokenPercentage).toBe(0.3);
      expect(parsed.protocol).toBe("legacy");
    }
  });
});

describe("DMind validator", () => {
  const sdk = new DMind();

  it("checks SEARCH_TOKEN requires symbol/address/keyword", () => {
    const result = sdk.validate({
      type: "tool_call",
      tool: "SEARCH_TOKEN",
      args: { chain: "solana" },
      protocol: "official",
      raw: ""
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("E_PARAM_MISSING");
    }
  });

  it("checks EXECUTE_SWAP amount and percentage are mutually exclusive", () => {
    const result = sdk.validate({
      type: "tool_call",
      tool: "EXECUTE_SWAP",
      args: {
        inputTokenSymbol: "SOL",
        inputTokenAmount: 1,
        inputTokenPercentage: 0.3
      },
      protocol: "official",
      raw: ""
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("E_PARAM_FORBIDDEN");
    }
  });

  it("checks percentage must be in [0,1]", () => {
    const result = sdk.validate({
      type: "tool_call",
      tool: "EXECUTE_SWAP",
      args: {
        inputTokenSymbol: "SOL",
        inputTokenPercentage: 1.2
      },
      protocol: "official",
      raw: ""
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("E_PARAM_INVALID");
    }
  });
});

describe("DMind runtime", () => {
  it("injects official developer prompt when caller prompt is missing", async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];
    const sdk = new DMind({
      modelGenerate: async (messages) => {
        capturedMessages = messages;
        return "ok";
      }
    });

    await sdk.generate([{ role: "user", content: "hello" }]);

    expect(capturedMessages[0]).toEqual({
      role: "developer",
      content: DMIND_3_NANO_DEVELOPER_PROMPT
    });
    expect(capturedMessages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("overrides invalid developer prompt with official prompt", async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];
    const sdk = new DMind({
      modelGenerate: async (messages) => {
        capturedMessages = messages;
        return "ok";
      }
    });

    await sdk.generate([
      { role: "developer", content: "Use tools if needed." },
      { role: "user", content: "swap SOL to USDC" }
    ]);

    const developerMessages = capturedMessages.filter(
      (msg) => msg.role === "developer"
    );
    expect(developerMessages).toHaveLength(1);
    expect(developerMessages[0].content).toBe(DMIND_3_NANO_DEVELOPER_PROMPT);
  });

  it("runs multi-turn tool loop with function_response feedback", async () => {
    let turn = 0;
    const sdk = new DMind({
      modelGenerate: async () => {
        turn += 1;
        if (turn === 1) {
          return '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC","chain":"ethereum"}<end_function_call>';
        }
        return "USDC on Ethereum resolved. Ready to continue.";
      },
      tools: {
        SEARCH_TOKEN: async (args) => ({
          ok: true,
          symbol: args.symbol,
          chain: args.chain,
          address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
        })
      }
    });

    const result = await runLoop(sdk, [
      { role: "developer", content: "Use official protocol for tool calls." },
      { role: "user", content: "Find the USDC contract address on Ethereum." }
    ]);

    expect(result.toolHops).toBe(1);
    expect(result.final.type).toBe("text");
    expect(
      result.messages.some((m) => m.content.startsWith("<function_response>"))
    ).toBe(true);
  });
});

describe("DMind extensibility", () => {
  const customProfile: ModelProfile = {
    id: "dmind-custom",
    tools: {
      PING_TOOL: {
        strict: true,
        parameters: {
          message: { type: "string", required: true, nonEmpty: true }
        }
      }
    }
  };

  it("supports custom profile tool names", () => {
    const sdk = new DMind({
      modelProfile: customProfile
    });

    const raw =
      '<start_function_call>call:PING_TOOL{"message":"hello"}<end_function_call>';
    const parsed = sdk.parse(raw, "official");
    expect(parsed.type).toBe("tool_call");
    if (parsed.type === "tool_call") {
      expect(parsed.tool).toBe("PING_TOOL");
      expect(parsed.args).toEqual({ message: "hello" });
    }
  });

  it("rejects unknown tools for the selected profile", () => {
    const sdk = new DMind({
      modelProfile: customProfile
    });

    const raw =
      '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC"}<end_function_call>';
    const parsed = sdk.parse(raw, "official");
    expect(parsed.type).toBe("parse_error");
    if (parsed.type === "parse_error") {
      expect(parsed.code).toBe("E_TOOL_UNKNOWN");
    }
  });

  it("skips developer prompt enforcement when profile policy is not configured", async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];
    const sdk = new DMind({
      modelProfile: customProfile,
      modelGenerate: async (messages) => {
        capturedMessages = messages;
        return "ok";
      }
    });

    await sdk.generate([{ role: "user", content: "hello" }]);
    expect(capturedMessages).toEqual([{ role: "user", content: "hello" }]);
  });
});
