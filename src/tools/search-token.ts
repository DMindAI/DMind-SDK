import { z } from "zod";
import { tool } from "../tool";

// ---------------------------------------------------------------------------
// Schema exactly matching DMind-3-nano model card:
// https://huggingface.co/DMindAI/DMind-3-nano#tool-definitions--schemas
// ---------------------------------------------------------------------------

export type Chain = "solana" | "ethereum" | "bsc" | "base";

export interface SearchTokenInput {
  /** Token ticker symbol (e.g. SOL, USDC) */
  symbol?: string;
  /** Contract address of the token */
  address?: string;
  /** Target blockchain network */
  chain?: Chain;
  /** Free-text search keywords */
  keyword?: string;
}

const CHAIN_VALUES = ["solana", "ethereum", "bsc", "base"] as const;

export const searchTokenInputSchema: z.ZodType<SearchTokenInput> = z.object({
  symbol: z.string().optional(),
  address: z.string().optional(),
  chain: z.enum(CHAIN_VALUES).optional(),
  keyword: z.string().optional(),
});

const SEARCH_TOKEN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    symbol: {
      type: "string",
      description: "The ticker symbol of the token (e.g., 'SOL', 'USDC').",
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
};

export const SEARCH_TOKEN = tool({
  name: "SEARCH_TOKEN",
  description:
    "Search for a cryptocurrency token on-chain to retrieve its metadata or address.",
  inputSchema: searchTokenInputSchema,
  jsonSchemaParameters: SEARCH_TOKEN_JSON_SCHEMA,
  execute: false,
});
