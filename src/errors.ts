export type SDKErrorCode =
  | "E_NO_WRAPPER"
  | "E_WRONG_PROTOCOL"
  | "E_JSON_INVALID"
  | "E_TOOL_UNKNOWN"
  | "E_PARAM_MISSING"
  | "E_PARAM_FORBIDDEN"
  | "E_PARAM_INVALID"
  | "E_INVOKE_COUNT"
  | "E_RUNTIME";

export interface ValidationIssue {
  code: SDKErrorCode;
  message: string;
}

export class SDKError extends Error {
  public readonly code: SDKErrorCode;
  public readonly details?: unknown;

  constructor(code: SDKErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.details = details;
  }
}

