import { Chat } from "./chat";
import type { DMindOptions } from "./chat-types";
import {
  FUNCTION_RESPONSE_END,
  FUNCTION_RESPONSE_START
} from "./constants";
import { SDKError } from "./errors";
import { enforceDeveloperPrompt } from "./developer-prompt";
import { parse } from "./parser";
import { DMIND_3_NANO_PROFILE, toolNameSet } from "./profiles";
import type {
  BasicValidationResult,
  DetailedValidationResult,
  SDKCore,
  Message,
  ModelProfile,
  ParsedResult,
  ProtocolMode,
  ToolCallResult,
  ToolHandlers
} from "./types";
import { validate, validateDetailed } from "./validator";

export class DMind implements SDKCore {
  readonly chat: Chat;

  private readonly _apiKey?: string;
  private readonly _baseUrl?: string;
  private readonly protocolMode: ProtocolMode;
  private readonly modelGenerate?: (messages: Message[]) => Promise<string>;
  private readonly tools: ToolHandlers;
  private readonly modelProfile: ModelProfile;
  private readonly allowedTools: Set<string>;

  constructor(options: DMindOptions = {}) {
    this._apiKey = options.apiKey;
    this._baseUrl = options.baseUrl;
    this.protocolMode = options.protocolMode ?? "official";
    this.modelGenerate = options.modelGenerate;
    this.tools = options.tools ?? {};
    this.modelProfile = options.modelProfile ?? DMIND_3_NANO_PROFILE;
    this.allowedTools = toolNameSet(this.modelProfile);
    this.chat = new Chat(options);
  }

  get apiKey(): string | undefined {
    return this._apiKey;
  }

  get baseUrl(): string | undefined {
    return this._baseUrl;
  }

  async generate(messages: Message[]): Promise<string> {
    if (!this.modelGenerate) {
      throw new SDKError(
        "E_RUNTIME",
        "modelGenerate is not configured. Pass options.modelGenerate in constructor."
      );
    }
    return this.modelGenerate(
      enforceDeveloperPrompt(messages, this.modelProfile.developerPromptPolicy)
    );
  }

  parse(raw: string, mode: ProtocolMode = this.protocolMode): ParsedResult {
    return parse(raw, mode, { allowedTools: this.allowedTools });
  }

  validate(call: ToolCallResult): BasicValidationResult {
    return validate(call, this.modelProfile);
  }

  validateDetailed(call: ToolCallResult): DetailedValidationResult {
    return validateDetailed(call, this.modelProfile);
  }

  async execute(call: ToolCallResult): Promise<any> {
    const validation = validateDetailed(call, this.modelProfile);
    if (!validation.ok) {
      throw new SDKError(
        validation.errors[0].code,
        validation.errors.map((x) => `${x.code}: ${x.message}`).join("; "),
        validation.errors
      );
    }

    const handler = this.tools[call.tool];
    if (!handler) {
      throw new SDKError(
        "E_TOOL_UNKNOWN",
        `No tool executor registered for ${call.tool}.`
      );
    }
    return handler(call.args);
  }

  wrapResponse(payload: any): string {
    return `${FUNCTION_RESPONSE_START}${JSON.stringify(payload)}${FUNCTION_RESPONSE_END}`;
  }
}
