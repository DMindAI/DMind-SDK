# DMind Function Call SDK

A protocol adapter SDK focused on tool-calling compatibility.

It converts DMind function-call outputs to OpenAI/OpenRouter-style tool calls, and back again.

## What This SDK Does

- Parses DMind official wrapper format:
  - `<start_function_call>call:TOOL_NAME{...}<end_function_call>`
- Parses DMind legacy XML format:
  - `<function_calls><invoke ... /></function_calls>`
- Normalizes outputs to OpenAI-compatible assistant messages with `tool_calls`
- Converts OpenAI assistant tool calls back to DMind raw protocol strings
- Validates tool arguments with model profiles

## Installation

```bash
npm install dmind-function-call-sdk
```

## Default Profile

The SDK ships with a built-in `dmind-3-nano` model profile and rules for:

- `SEARCH_TOKEN`
- `EXECUTE_SWAP`

## Quick Start

```ts
import { DMindFunctionCallSDK } from "dmind-function-call-sdk";

const sdk = new DMindFunctionCallSDK(); // uses dmind-3-nano profile by default

const raw =
  '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC","chain":"ethereum"}<end_function_call>';

const openai = sdk.parseDMindToOpenAIMessage(raw);
```

## OpenAI / OpenRouter Interop

```ts
import {
  dmindRawToOpenAIMessage,
  openAIAssistantMessageToDMindRaw,
  openAIToolResultMessage
} from "dmind-function-call-sdk";

const openaiMessage = dmindRawToOpenAIMessage(
  '<start_function_call>call:SEARCH_TOKEN{"symbol":"USDC"}<end_function_call>'
);

const dmindRaw = openAIAssistantMessageToDMindRaw({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_1",
      type: "function",
      function: { name: "SEARCH_TOKEN", arguments: "{\"symbol\":\"USDC\"}" }
    }
  ]
});

const toolResult = openAIToolResultMessage("call_1", {
  status: "ok",
  result: { address: "0x..." }
});
```

## Extending for Other DMind Models

You can provide a custom model profile to support other DMind-series formats and tool schemas.

```ts
import { DMindFunctionCallSDK, type ModelProfile } from "dmind-function-call-sdk";

const customProfile: ModelProfile = {
  id: "dmind-x",
  tools: {
    PING_TOOL: {
      strict: true,
      parameters: {
        message: { type: "string", required: true, nonEmpty: true }
      }
    }
  }
};

const sdk = new DMindFunctionCallSDK({ modelProfile: customProfile });
```

## Error Codes

- `E_NO_WRAPPER`
- `E_WRONG_PROTOCOL`
- `E_JSON_INVALID`
- `E_TOOL_UNKNOWN`
- `E_PARAM_MISSING`
- `E_PARAM_FORBIDDEN`
- `E_PARAM_INVALID`
- `E_INVOKE_COUNT`

