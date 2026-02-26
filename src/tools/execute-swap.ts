import { z } from "zod";
import { tool } from "../tool";

// ---------------------------------------------------------------------------
// Schema exactly matching DMind-3-nano model card:
// https://huggingface.co/DMindAI/DMind-3-nano#tool-definitions--schemas
// ---------------------------------------------------------------------------

export interface ExecuteSwapInput {
  /** Symbol of the token being sold (e.g. SOL) */
  inputTokenSymbol: string;
  /** Contract address of the input token */
  inputTokenCA?: string;
  /** Contract address of the output token */
  outputTokenCA?: string;
  /** Absolute amount of input token to swap */
  inputTokenAmount?: number;
  /** Percentage of input token balance to swap (0.0–1.0) */
  inputTokenPercentage?: number;
  /** Minimum amount of output token expected */
  outputTokenAmount?: number;
}

export const executeSwapInputSchema: z.ZodType<ExecuteSwapInput> = z.object({
  inputTokenSymbol: z.string(),
  inputTokenCA: z.string().optional(),
  outputTokenCA: z.string().optional(),
  inputTokenAmount: z.number().optional(),
  inputTokenPercentage: z.number().optional(),
  outputTokenAmount: z.number().optional(),
});

const EXECUTE_SWAP_JSON_SCHEMA: Record<string, unknown> = {
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
};

export const EXECUTE_SWAP = tool({
  name: "EXECUTE_SWAP",
  description: "Propose a token swap transaction.",
  inputSchema: executeSwapInputSchema,
  jsonSchemaParameters: EXECUTE_SWAP_JSON_SCHEMA,
  execute: false,
});
