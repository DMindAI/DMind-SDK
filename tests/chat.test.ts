import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DMind,
  DMIND_3_NANO_DEVELOPER_PROMPT,
  type ChatResponse,
  type ChatStreamingChunk,
  type ModelProfile
} from "../src";

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockFetchResponse(body, status),
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as unknown as Response;
}

function mockSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    body: stream,
    json: () => Promise.reject(new Error("streaming")),
    text: () => Promise.reject(new Error("streaming")),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockSSEResponse(chunks),
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as unknown as Response;
}

describe("DMind chat", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new DMind({
    apiKey: "test-key",
    baseUrl: "https://api.test.com/v1",
    defaultModel: "dmind-3-nano",
  });

  it("sends non-streaming chat request and parses response", async () => {
    const rawResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1700000000,
      model: "dmind-3-nano",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Paris is the capital of France.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(rawResponse));

    const response = await client.chat.send({
      messages: [{ role: "user", content: "What is the capital of France?" }],
    });

    expect(response.id).toBe("chatcmpl-123");
    expect(response.object).toBe("chat.completion");
    expect(response.model).toBe("dmind-3-nano");
    expect(response.choices[0].message.content).toBe("Paris is the capital of France.");
    expect(response.choices[0].finishReason).toBe("stop");
    expect(response.usage?.promptTokens).toBe(20);
    expect(response.usage?.completionTokens).toBe(10);
    expect(response.usage?.totalTokens).toBe(30);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.test.com/v1/chat/completions");

    const requestInit = fetchCall[1] as RequestInit;
    expect(requestInit.method).toBe("POST");

    const headers = requestInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("dmind-3-nano");
    expect(body.messages[0]).toEqual({
      role: "developer",
      content: DMIND_3_NANO_DEVELOPER_PROMPT
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "What is the capital of France?"
    });
  });

  it("serializes request parameters in snake_case", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [{ role: "user", content: "hi" }],
      model: "dmind-3-nano",
      maxTokens: 100,
      topP: 0.9,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      temperature: 0.7,
      seed: 42,
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.max_tokens).toBe(100);
    expect(body.top_p).toBe(0.9);
    expect(body.frequency_penalty).toBe(0.5);
    expect(body.presence_penalty).toBe(0.3);
    expect(body.temperature).toBe(0.7);
    expect(body.seed).toBe(42);
  });

  it("serializes tool definitions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_weather", arguments: '{"location":"Tokyo"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    );

    const response = await client.chat.send({
      messages: [{ role: "user", content: "Weather in Tokyo?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather info",
            parameters: { type: "object", properties: { location: { type: "string" } } },
          },
        },
      ],
      toolChoice: "auto",
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.tools[0].function.name).toBe("get_weather");
    expect(body.tool_choice).toBe("auto");

    const tc = response.choices[0].message.toolCalls?.[0];
    expect(tc?.id).toBe("call_1");
    expect(tc?.function.name).toBe("get_weather");
    expect(tc?.function.arguments).toBe('{"location":"Tokyo"}');
  });

  it("serializes assistant and tool messages correctly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "call_1", type: "function", function: { name: "foo", arguments: "{}" } },
          ],
        },
        { role: "tool", toolCallId: "call_1", content: '{"result":"ok"}' },
      ],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const assistantMsg = body.messages[2];
    expect(assistantMsg.tool_calls[0].id).toBe("call_1");
    const toolMsg = body.messages[3];
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(toolMsg.role).toBe("tool");
  });

  it("streams SSE chunks as async iterable", async () => {
    const sseData = [
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1700000000,"model":"dmind-3-nano","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1700000000,"model":"dmind-3-nano","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1700000000,"model":"dmind-3-nano","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    vi.mocked(fetch).mockResolvedValueOnce(mockSSEResponse(sseData));

    const stream = await client.chat.send({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const chunks: ChatStreamingChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    expect(chunks[0].choices[0].delta.content).toBe("Hello");
    expect(chunks[1].choices[0].delta.content).toBe(" world");
    expect(chunks[2].choices[0].finishReason).toBe("stop");
  });

  it("handles streaming tool call deltas", async () => {
    const sseData = [
      'data: {"id":"c","object":"chat.completion.chunk","created":0,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c","object":"chat.completion.chunk","created":0,"model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c","object":"chat.completion.chunk","created":0,"model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\":\\"Tokyo\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c","object":"chat.completion.chunk","created":0,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    vi.mocked(fetch).mockResolvedValueOnce(mockSSEResponse(sseData));

    const stream = await client.chat.send({
      messages: [{ role: "user", content: "weather" }],
      stream: true,
    });

    const chunks: ChatStreamingChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(4);
    expect(chunks[0].choices[0].delta.toolCalls?.[0].id).toBe("call_1");
    expect(chunks[0].choices[0].delta.toolCalls?.[0].function?.name).toBe("get_weather");
    expect(chunks[1].choices[0].delta.toolCalls?.[0].function?.arguments).toBe('{"loc');
    expect(chunks[2].choices[0].delta.toolCalls?.[0].function?.arguments).toBe('ation":"Tokyo"}');
    expect(chunks[3].choices[0].finishReason).toBe("tool_calls");
  });

  it("throws SDKError on non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: { message: "Invalid API key" } }, 401),
    );

    await expect(
      client.chat.send({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow("Chat API returned 401");
  });

  it("uses defaultModel when model is not specified", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [{ role: "user", content: "hi" }],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.model).toBe("dmind-3-nano");
  });

  it("overrides defaultModel when model is specified in request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [{ role: "user", content: "hi" }],
      model: "dmind-4",
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.model).toBe("dmind-4");
  });

  it("overrides invalid developer prompt with official prompt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [
        { role: "developer", content: "Please call tools in JSON." },
        { role: "user", content: "hi" },
      ],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0]).toEqual({
      role: "developer",
      content: DMIND_3_NANO_DEVELOPER_PROMPT,
    });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("keeps official developer prompt unchanged", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    await client.chat.send({
      messages: [
        { role: "developer", content: DMIND_3_NANO_DEVELOPER_PROMPT },
        { role: "user", content: "hi" },
      ],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const developerMessages = body.messages.filter((msg: any) => msg.role === "developer");
    expect(developerMessages).toHaveLength(1);
    expect(developerMessages[0].content).toBe(DMIND_3_NANO_DEVELOPER_PROMPT);
  });

  it("skips prompt injection when custom profile has no developerPromptPolicy", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({
        id: "x",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );

    const customProfile: ModelProfile = {
      id: "custom-model",
      tools: {},
    };
    const customClient = new DMind({
      apiKey: "test-key",
      baseUrl: "https://api.test.com/v1",
      modelProfile: customProfile,
    });

    await customClient.chat.send({
      messages: [{ role: "user", content: "hi" }],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("exposes apiKey and baseUrl on DMind", () => {
    expect(client.apiKey).toBe("test-key");
    expect(client.baseUrl).toBe("https://api.test.com/v1");
  });
});
