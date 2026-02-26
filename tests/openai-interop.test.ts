import { describe, expect, it } from "vitest";
import {
  dmindRawToOpenAIMessage,
  normalizeAssistantOutputToOpenAI,
  openAIAssistantMessageToDMindRaw,
  openAIToolResultMessage
} from "../src";

describe("openai interop", () => {
  it("converts DMind official tool call to OpenAI assistant tool_calls", () => {
    const raw =
      '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC","chain":"ethereum"}<end_function_call>';
    const converted = dmindRawToOpenAIMessage(raw);

    expect(converted.type).toBe("assistant_message");
    if (converted.type === "assistant_message") {
      expect(converted.protocol).toBe("dmind_official");
      expect(converted.message.tool_calls?.length).toBe(1);
      const call = converted.message.tool_calls?.[0];
      expect(call?.type).toBe("function");
      expect(call?.function.name).toBe("SEARCH_TOKEN");
      expect(JSON.parse(call?.function.arguments ?? "{}")).toEqual({
        symbol: "USDC",
        chain: "ethereum"
      });
    }
  });

  it("converts DMind text to OpenAI assistant text message", () => {
    const converted = dmindRawToOpenAIMessage(
      "How much SOL would you like to swap?"
    );
    expect(converted.type).toBe("assistant_message");
    if (converted.type === "assistant_message") {
      expect(converted.message.content).toContain("swap");
      expect(converted.message.tool_calls).toBeUndefined();
    }
  });

  it("converts OpenAI tool_calls message back to DMind official wrapper", () => {
    const converted = openAIAssistantMessageToDMindRaw({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_x",
          type: "function",
          function: {
            name: "EXECUTE_SWAP",
            arguments: '{"inputTokenSymbol":"SOL","inputTokenPercentage":0.3}'
          }
        }
      ]
    });

    expect("type" in converted && converted.type).toBe("raw");
    if ("type" in converted && converted.type === "raw") {
      expect(converted.raw).toBe(
        '<start_function_call>call:EXECUTE_SWAP{"inputTokenSymbol":"SOL","inputTokenPercentage":0.3}<end_function_call>'
      );
    }
  });

  it("returns E_INVOKE_COUNT for multiple OpenAI tool calls to DMind", () => {
    const converted = openAIAssistantMessageToDMindRaw({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "a",
          type: "function",
          function: { name: "SEARCH_TOKEN", arguments: '{"symbol":"USDC"}' }
        },
        {
          id: "b",
          type: "function",
          function: { name: "SEARCH_TOKEN", arguments: '{"symbol":"SOL"}' }
        }
      ]
    });

    expect("type" in converted && converted.type).toBe("parse_error");
    if ("type" in converted && converted.type === "parse_error") {
      expect(converted.code).toBe("E_INVOKE_COUNT");
    }
  });

  it("enforces allowed tool set when provided", () => {
    const converted = openAIAssistantMessageToDMindRaw(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "a",
            type: "function",
            function: { name: "SOME_NEW_TOOL", arguments: "{}" }
          }
        ]
      },
      "official",
      { allowedTools: new Set(["SEARCH_TOKEN"]) }
    );

    expect("type" in converted && converted.type).toBe("parse_error");
    if ("type" in converted && converted.type === "parse_error") {
      expect(converted.code).toBe("E_TOOL_UNKNOWN");
    }
  });

  it("normalizes OpenAI completion-like payload", () => {
    const normalized = normalizeAssistantOutputToOpenAI({
      choices: [
        {
          message: {
            role: "assistant",
            content: "ok"
          }
        }
      ]
    });
    expect(normalized.type).toBe("assistant_message");
    if (normalized.type === "assistant_message") {
      expect(normalized.protocol).toBe("openai");
      expect(normalized.message.content).toBe("ok");
    }
  });

  it("wraps tool response as OpenAI tool message", () => {
    const msg = openAIToolResultMessage("call_abc", {
      status: "ok",
      result: { amount: 1 }
    });
    expect(msg.role).toBe("tool");
    expect(msg.tool_call_id).toBe("call_abc");
    expect(JSON.parse(msg.content)).toEqual({
      status: "ok",
      result: { amount: 1 }
    });
  });
});
