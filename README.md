# DMind SDK

TypeScript SDK for the [DMind AI](https://huggingface.co/DMindAI/DMind-3-nano) platform — chat completions with built-in crypto trading tools.

## Installation

```bash
npm install @dmindai/sdk
```

## Quick Start

```ts
import {
  DMind,
  SEARCH_TOKEN,
  EXECUTE_SWAP,
  type SearchTokenInput,
  type ExecuteSwapInput,
} from "@dmindai/sdk";

// 1. Implement the two built-in tools with your own backend logic
//    params is fully typed — IDE will auto-complete all fields from SearchTokenInput / ExecuteSwapInput

const searchToken = SEARCH_TOKEN.implement(async (params: SearchTokenInput) => {
  const tokens = await myTokenService.search(params);
  return { tokens };
});

const executeSwap = EXECUTE_SWAP.implement(async (params: ExecuteSwapInput) => {
  const result = await myDexService.buildSwap(params);
  return { transaction: result.transaction, quote: result.quote };
});

// 2. Create the DMind client

const dmind = new DMind({
  baseUrl: "http://localhost:8000/v1", // vLLM local server
  apiKey: "your-api-key", // optional
});

// 3. Send a chat request with tool definitions

const response = await dmind.chat.send({
  messages: [{ role: "user", content: "Swap 1 SOL to USDC on Solana" }],
  model: "dmind-3-nano",
  tools: [searchToken.toDefinition(), executeSwap.toDefinition()],
  toolChoice: "auto",
});

// 4. Handle the tool call

const toolCall = response.choices[0].message.toolCalls?.[0];
if (toolCall) {
  const args = searchToken.parseInput(JSON.parse(toolCall.function.arguments));
  console.log("Tool called:", toolCall.function.name, args);
}
```

## Built-in Tools

The SDK provides two fixed tools matching the [DMind-3-nano model card](https://huggingface.co/DMindAI/DMind-3-nano#tool-definitions--schemas). Their names, descriptions, and parameter schemas cannot be modified.

### SEARCH_TOKEN

Search for a cryptocurrency token on-chain to retrieve its metadata or address.

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| symbol    | string | No       | Token ticker symbol (e.g. `SOL`, `USDC`)               |
| address   | string | No       | Contract address of the token                          |
| chain     | string | No       | Target blockchain: `solana`, `ethereum`, `bsc`, `base` |
| keyword   | string | No       | Free-text search keywords                              |

### EXECUTE_SWAP

Propose a token swap transaction.

| Parameter            | Type   | Required | Description                             |
| -------------------- | ------ | -------- | --------------------------------------- |
| inputTokenSymbol     | string | Yes      | Symbol of the token being sold          |
| inputTokenCA         | string | No       | Contract address of the input token     |
| outputTokenCA        | string | No       | Contract address of the output token    |
| inputTokenAmount     | number | No       | Absolute amount to swap                 |
| inputTokenPercentage | number | No       | Percentage of balance to swap (0.0–1.0) |
| outputTokenAmount    | number | No       | Minimum output amount expected          |

### Using Tools Without Execute Logic

The tools can also be used directly without `implement()` — for schema definitions and input parsing only:

```ts
import { SEARCH_TOKEN, EXECUTE_SWAP } from "@dmindai/sdk";

// Get the fixed JSON schema for the chat API
const tools = [SEARCH_TOKEN.toDefinition(), EXECUTE_SWAP.toDefinition()];

// Parse and validate raw tool call arguments
const args = SEARCH_TOKEN.parseInput({ symbol: "SOL", chain: "solana" });
```

## Streaming

```ts
const stream = await dmind.chat.send({
  messages: [{ role: "user", content: "Find the USDC token on Ethereum" }],
  model: "dmind-3-nano",
  tools: [searchToken.toDefinition()],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0].delta.content ?? "");
}
```

## Multi-turn Tool Loop

For automated multi-turn conversations with tool execution:

```ts
import { DMind, runLoop } from "@dmindai/sdk";

const dmind = new DMind({
  modelGenerate: async (messages) => {
    // call your model inference here
    return modelResponse;
  },
  tools: {
    SEARCH_TOKEN: async (args) => {
      return await myTokenService.search(args);
    },
    EXECUTE_SWAP: async (args) => {
      return await myDexService.buildSwap(args);
    },
  },
});

const result = await runLoop(dmind, [
  { role: "user", content: "Swap 0.5 SOL to USDC" },
]);

console.log(result.final); // final parsed result
console.log(result.toolHops); // number of tool calls executed
```

## Developer Prompt Guard (DMind-3-nano)

For `dmind-3-nano`, the SDK enforces the official developer prompt from the model card:

- If no `developer` message is provided, the SDK injects the official one.
- If a `developer` message exists but does not match the official policy, the SDK replaces it.
- This guard is applied in both `dmind.generate(...)` and `dmind.chat.send(...)`.
- For custom `modelProfile` without `developerPromptPolicy`, no prompt is injected.

This keeps tool-call behavior aligned with the model's expected protocol.
