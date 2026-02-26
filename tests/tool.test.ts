import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  tool,
  SEARCH_TOKEN,
  EXECUTE_SWAP,
  type InferToolInput,
} from "../src";

describe("tool() helper", () => {
  it("creates a regular tool with execute function", async () => {
    const pingTool = tool({
      name: "ping",
      description: "Ping pong",
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ reply: z.string() }),
      execute: async (params) => ({ reply: `pong: ${params.message}` }),
    });

    expect(pingTool.name).toBe("ping");
    expect(pingTool.type).toBe("regular");
    expect(pingTool.execute).not.toBe(false);

    const result = await (pingTool.execute as Function)({ message: "hello" });
    expect(result).toEqual({ reply: "pong: hello" });
  });

  it("creates a manual tool with execute: false", () => {
    const manualTool = tool({
      name: "manual_op",
      description: "Manual operation",
      inputSchema: z.object({ data: z.string() }),
      execute: false,
    });

    expect(manualTool.name).toBe("manual_op");
    expect(manualTool.type).toBe("manual");
    expect(manualTool.execute).toBe(false);
  });

  it("creates a generator tool with eventSchema", async () => {
    const genTool = tool({
      name: "gen_op",
      description: "Generator operation",
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ results: z.array(z.string()) }),
      eventSchema: z.object({ progress: z.number() }),
      execute: async function* (_params) {
        yield { progress: 50 };
        yield { progress: 100 };
        return { results: ["a", "b"] };
      },
    });

    expect(genTool.type).toBe("generator");
    expect(genTool.eventSchema).toBeDefined();
  });

  it("converts to ToolDefinition for chat.send()", () => {
    const myTool = tool({
      name: "get_weather",
      description: "Get weather for a location",
      inputSchema: z.object({
        location: z.string(),
        units: z.enum(["celsius", "fahrenheit"]).optional(),
      }),
      execute: false,
    });

    const def = myTool.toDefinition();
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("get_weather");
    expect(def.function.description).toBe("Get weather for a location");

    const params = def.function.parameters as Record<string, any>;
    expect(params.type).toBe("object");
    expect(params.properties.location.type).toBe("string");
    expect(params.properties.units.enum).toEqual(["celsius", "fahrenheit"]);
    expect(params.required).toEqual(["location"]);
  });

  it("parseInput validates and parses raw data", () => {
    const myTool = tool({
      name: "typed",
      description: "Typed tool",
      inputSchema: z.object({
        value: z.number(),
        label: z.string().optional(),
      }),
      execute: false,
    });

    const parsed = myTool.parseInput({ value: 42 });
    expect(parsed).toEqual({ value: 42 });

    expect(() => myTool.parseInput({ value: "not a number" })).toThrow();
  });

  it("implement() creates a new tool with execute logic", async () => {
    const manualTool = tool({
      name: "op",
      description: "An operation",
      inputSchema: z.object({ x: z.number() }),
      execute: false,
    });

    expect(manualTool.type).toBe("manual");

    const implemented = manualTool.implement(async (params) => ({
      result: params.x * 2,
    }));

    expect(implemented.name).toBe("op");
    expect(implemented.type).toBe("regular");
    expect(implemented.execute).not.toBe(false);

    const result = await (implemented.execute as Function)({ x: 5 });
    expect(result).toEqual({ result: 10 });

    const def1 = manualTool.toDefinition();
    const def2 = implemented.toDefinition();
    expect(def1).toEqual(def2);
  });
});

describe("SEARCH_TOKEN tool", () => {
  it("has correct name and type", () => {
    expect(SEARCH_TOKEN.name).toBe("SEARCH_TOKEN");
    expect(SEARCH_TOKEN.type).toBe("manual");
    expect(SEARCH_TOKEN.execute).toBe(false);
  });

  it("generates exact HuggingFace JSON schema", () => {
    const def = SEARCH_TOKEN.toDefinition();
    expect(def).toEqual({
      type: "function",
      function: {
        name: "SEARCH_TOKEN",
        description:
          "Search for a cryptocurrency token on-chain to retrieve its metadata or address.",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description:
                "The ticker symbol of the token (e.g., 'SOL', 'USDC').",
            },
            address: {
              type: "string",
              description:
                "The specific contract address (CA) of the token, if known.",
            },
            chain: {
              type: "string",
              enum: ["solana", "ethereum", "bsc", "base"],
              description: "The target blockchain network.",
            },
            keyword: {
              type: "string",
              description:
                "General search keywords (e.g., project name) if symbol/address are unclear.",
            },
          },
          required: [],
        },
      },
    });
  });

  it("parses valid symbol search", () => {
    const input = SEARCH_TOKEN.parseInput({ symbol: "USDC" });
    expect(input.symbol).toBe("USDC");
  });

  it("parses valid address search", () => {
    const input = SEARCH_TOKEN.parseInput({
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    });
    expect(input.address).toBeDefined();
  });

  it("parses valid keyword search", () => {
    const input = SEARCH_TOKEN.parseInput({ keyword: "usd stablecoin" });
    expect(input.keyword).toBe("usd stablecoin");
  });

  it("accepts chain enum values", () => {
    const input = SEARCH_TOKEN.parseInput({
      symbol: "SOL",
      chain: "solana",
    });
    expect(input.chain).toBe("solana");
  });

  it("rejects invalid chain value", () => {
    expect(() =>
      SEARCH_TOKEN.parseInput({ symbol: "SOL", chain: "polygon" }),
    ).toThrow();
  });

  it("accepts empty object (all fields optional)", () => {
    const input = SEARCH_TOKEN.parseInput({});
    expect(input).toEqual({});
  });

  it("implement() creates an executable SEARCH_TOKEN", async () => {
    const impl = SEARCH_TOKEN.implement(async (params) => ({
      tokens: [{ symbol: params.symbol ?? "?", chain: params.chain ?? "unknown" }],
    }));

    expect(impl.name).toBe("SEARCH_TOKEN");
    expect(impl.type).toBe("regular");
    expect(impl.toDefinition()).toEqual(SEARCH_TOKEN.toDefinition());

    const result = await (impl.execute as Function)({ symbol: "SOL", chain: "solana" });
    expect(result.tokens[0].symbol).toBe("SOL");
  });
});

describe("EXECUTE_SWAP tool", () => {
  it("has correct name and type", () => {
    expect(EXECUTE_SWAP.name).toBe("EXECUTE_SWAP");
    expect(EXECUTE_SWAP.type).toBe("manual");
    expect(EXECUTE_SWAP.execute).toBe(false);
  });

  it("generates exact HuggingFace JSON schema", () => {
    const def = EXECUTE_SWAP.toDefinition();
    expect(def).toEqual({
      type: "function",
      function: {
        name: "EXECUTE_SWAP",
        description: "Propose a token swap transaction.",
        parameters: {
          type: "object",
          properties: {
            inputTokenSymbol: {
              type: "string",
              description: "Symbol of the token being sold (e.g., 'SOL').",
            },
            inputTokenCA: {
              type: "string",
              description: "Contract address of the token being sold.",
            },
            outputTokenCA: {
              type: "string",
              description: "Contract address of the token being bought.",
            },
            inputTokenAmount: {
              type: "number",
              description: "Absolute amount of input token to swap.",
            },
            inputTokenPercentage: {
              type: "number",
              description:
                "Percentage of balance to swap (0.0 to 1.0), used if exact amount is not specified.",
            },
            outputTokenAmount: {
              type: "number",
              description:
                "Minimum amount of output token expected (optional/slippage related).",
            },
          },
          required: ["inputTokenSymbol"],
        },
      },
    });
  });

  it("parses valid swap with amount", () => {
    const input = EXECUTE_SWAP.parseInput({
      inputTokenSymbol: "SOL",
      inputTokenAmount: 1.5,
    });
    expect(input.inputTokenSymbol).toBe("SOL");
    expect(input.inputTokenAmount).toBe(1.5);
  });

  it("parses valid swap with percentage", () => {
    const input = EXECUTE_SWAP.parseInput({
      inputTokenSymbol: "SOL",
      inputTokenPercentage: 0.5,
    });
    expect(input.inputTokenPercentage).toBe(0.5);
  });

  it("requires inputTokenSymbol", () => {
    expect(() =>
      EXECUTE_SWAP.parseInput({ inputTokenAmount: 1 }),
    ).toThrow();
  });

  it("accepts all optional fields", () => {
    const input = EXECUTE_SWAP.parseInput({
      inputTokenSymbol: "USDC",
      inputTokenCA: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      outputTokenCA: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      inputTokenAmount: 100,
      outputTokenAmount: 99.5,
    });
    expect(input.inputTokenCA).toBeDefined();
    expect(input.outputTokenCA).toBeDefined();
  });

  it("implement() creates an executable EXECUTE_SWAP", async () => {
    const impl = EXECUTE_SWAP.implement(async (params) => ({
      txHash: `swap-${params.inputTokenSymbol}`,
    }));

    expect(impl.name).toBe("EXECUTE_SWAP");
    expect(impl.type).toBe("regular");
    expect(impl.toDefinition()).toEqual(EXECUTE_SWAP.toDefinition());

    const result = await (impl.execute as Function)({ inputTokenSymbol: "SOL" });
    expect(result.txHash).toBe("swap-SOL");
  });
});

describe("type inference", () => {
  it("InferToolInput extracts correct input type", () => {
    type Input = InferToolInput<typeof SEARCH_TOKEN>;
    const input: Input = { symbol: "USDC" };
    expect(input.symbol).toBe("USDC");
  });
});
