import type { DeveloperPromptPolicy } from "./types";

const DEFAULT_REQUIRED_SNIPPETS = [
  "You may use only two tools: SEARCH_TOKEN and EXECUTE_SWAP.",
  "<start_function_call>call:TOOL_NAME{...JSON...}<end_function_call>",
  "If no function call is needed, output normal text without wrappers."
];

type PromptMessage = { role: string; content?: unknown };

function normalizePromptText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function isDeveloperPromptCompliant(
  content: string,
  policy: DeveloperPromptPolicy
): boolean {
  const normalized = normalizePromptText(content);
  const canonical = normalizePromptText(policy.canonicalPrompt);
  if (normalized === canonical) {
    return true;
  }

  const snippets = policy.requiredSnippets ?? DEFAULT_REQUIRED_SNIPPETS;
  return snippets
    .map(normalizePromptText)
    .every((snippet) => normalized.includes(snippet));
}

function hasCompliantDeveloperPrompt<T extends PromptMessage>(
  messages: T[],
  policy: DeveloperPromptPolicy
): boolean {
  const developerMessages = messages.filter((msg) => msg.role === "developer");
  if (developerMessages.length !== 1) {
    return false;
  }

  if (messages[0]?.role !== "developer") {
    return false;
  }

  const content = messages[0].content;
  if (typeof content !== "string") {
    return false;
  }

  return isDeveloperPromptCompliant(content, policy);
}

export function enforceDeveloperPrompt<T extends PromptMessage>(
  messages: T[],
  policy?: DeveloperPromptPolicy
): T[] {
  if (!policy) {
    return messages;
  }

  if (hasCompliantDeveloperPrompt(messages, policy)) {
    return messages;
  }

  const cleaned = messages.filter((msg) => msg.role !== "developer");
  const injectedDeveloper = {
    role: "developer",
    content: policy.canonicalPrompt
  } as T;

  return [injectedDeveloper, ...cleaned];
}
