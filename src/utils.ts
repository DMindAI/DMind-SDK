import type { ParseErrorResult } from "./types";
import type { SDKErrorCode } from "./errors";

export function makeParseError(
  code: SDKErrorCode,
  message: string,
  raw: string
): ParseErrorResult {
  return { type: "parse_error", code, message, raw };
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isLikelyTokenAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // EVM address format.
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return true;
  }

  // Solana-like Base58 contract address.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function encodeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseLooseXmlValue(raw: string): any {
  const value = decodeXml(raw).trim();
  if (value.length === 0) {
    return "";
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

