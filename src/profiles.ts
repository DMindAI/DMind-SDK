import type { ValidationIssue } from "./errors";
import type { ModelProfile } from "./types";
import { isLikelyTokenAddress, isNonEmptyString } from "./utils";

const CHAIN_VALUES = ["solana", "ethereum", "bsc", "base"];

export const DMIND_3_NANO_DEVELOPER_PROMPT = `You are a model that can do function calling with the following functions.

You may use only two tools: SEARCH_TOKEN and EXECUTE_SWAP.

Do not call any tools besides SEARCH_TOKEN and EXECUTE_SWAP.

For function calls, output only this exact format:
<start_function_call>call:TOOL_NAME{...JSON...}<end_function_call>

If no function call is needed, output normal text without wrappers.`;

function validateSearchToken(args: Record<string, any>): ValidationIssue[] {
  const errors: ValidationIssue[] = [];

  const hasSearchSeed =
    isNonEmptyString(args.symbol) ||
    isNonEmptyString(args.address) ||
    isNonEmptyString(args.keyword);

  if (!hasSearchSeed) {
    errors.push({
      code: "E_PARAM_MISSING",
      message: "SEARCH_TOKEN requires at least one of symbol, address, or keyword."
    });
  }

  if (args.address !== undefined && isNonEmptyString(args.address)) {
    if (!isLikelyTokenAddress(args.address)) {
      errors.push({
        code: "E_PARAM_INVALID",
        message: "SEARCH_TOKEN.address format is invalid."
      });
    }
  }

  return errors;
}

function validateExecuteSwap(args: Record<string, any>): ValidationIssue[] {
  const errors: ValidationIssue[] = [];

  if (
    args.inputTokenAmount !== undefined &&
    args.inputTokenPercentage !== undefined
  ) {
    errors.push({
      code: "E_PARAM_FORBIDDEN",
      message:
        "inputTokenAmount and inputTokenPercentage are mutually exclusive."
    });
  }

  if (
    args.inputTokenAmount !== undefined &&
    typeof args.inputTokenAmount === "number" &&
    args.inputTokenAmount <= 0
  ) {
    errors.push({
      code: "E_PARAM_INVALID",
      message: "inputTokenAmount must be greater than 0."
    });
  }

  if (
    args.outputTokenAmount !== undefined &&
    typeof args.outputTokenAmount === "number" &&
    args.outputTokenAmount <= 0
  ) {
    errors.push({
      code: "E_PARAM_INVALID",
      message: "outputTokenAmount must be greater than 0."
    });
  }

  const maybeAddressKeys = ["inputTokenCA", "outputTokenCA"];
  for (const key of maybeAddressKeys) {
    const value = args[key];
    if (value !== undefined && isNonEmptyString(value) && !isLikelyTokenAddress(value)) {
      errors.push({
        code: "E_PARAM_INVALID",
        message: `${key} format is invalid.`
      });
    }
  }

  return errors;
}

export const DMIND_3_NANO_PROFILE: ModelProfile = {
  id: "dmind-3-nano",
  developerPromptPolicy: {
    canonicalPrompt: DMIND_3_NANO_DEVELOPER_PROMPT
  },
  tools: {
    SEARCH_TOKEN: {
      strict: true,
      parameters: {
        symbol: { type: "string", nonEmpty: true },
        address: { type: "string", nonEmpty: true },
        chain: { type: "string", enum: CHAIN_VALUES, nonEmpty: true },
        keyword: { type: "string", nonEmpty: true }
      },
      customValidate: validateSearchToken
    },
    EXECUTE_SWAP: {
      strict: true,
      parameters: {
        inputTokenSymbol: { type: "string", required: true, nonEmpty: true },
        inputTokenCA: { type: "string", nonEmpty: true },
        outputTokenCA: { type: "string", nonEmpty: true },
        inputTokenAmount: { type: "number" },
        inputTokenPercentage: { type: "number", min: 0, max: 1 },
        outputTokenAmount: { type: "number" }
      },
      customValidate: validateExecuteSwap
    }
  }
};

export function toolNameSet(profile: ModelProfile): Set<string> {
  return new Set(Object.keys(profile.tools));
}
