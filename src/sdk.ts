import {
  FUNCTION_RESPONSE_END,
  FUNCTION_RESPONSE_START
} from "./constants";
import { SDKError } from "./errors";
import {
  dmindRawToOpenAIMessage,
  openAIAssistantMessageToDMindRaw,
  openAIToolResultMessage
} from "./openai-interop";
import { parseAssistantOutput } from "./parser";
import { DMIND_3_NANO_PROFILE, toolNameSet } from "./profiles";
import type {
  BasicValidationResult,
  ConvertToXmlResult,
  DetailedValidationResult,
  DmindProtocol,
  FunctionCallSDK,
  FunctionCallInteropSDK,
  FunctionCallSDKOptions,
  Message,
  ModelProfile,
  OpenAIAssistantMessage,
  OpenAIInteropResult,
  OpenAIToolMessage,
  ParseErrorResult,
  ParsedResult,
  ProtocolMode,
  ToolCallResult,
  ToolHandlers
} from "./types";
import { validateToolCall, validateToolCallDetailed } from "./validator";
import { convertOfficialRawToLegacyXml } from "./xml";

export class DMindFunctionCallSDK implements FunctionCallInteropSDK {
  private readonly protocolMode: ProtocolMode;
  private readonly modelGenerate?: (messages: Message[]) => Promise<string>;
  private readonly tools: ToolHandlers;
  private readonly modelProfile: ModelProfile;
  private readonly allowedTools: Set<string>;

  constructor(options: FunctionCallSDKOptions = {}) {
    this.protocolMode = options.protocolMode ?? "official";
    this.modelGenerate = options.modelGenerate;
    this.tools = options.tools ?? {};
    this.modelProfile = options.modelProfile ?? DMIND_3_NANO_PROFILE;
    this.allowedTools = toolNameSet(this.modelProfile);
  }

  async generate(messages: Message[]): Promise<string> {
    if (!this.modelGenerate) {
      throw new SDKError(
        "E_RUNTIME",
        "modelGenerate is not configured. Pass options.modelGenerate in constructor."
      );
    }
    return this.modelGenerate(messages);
  }

  parseAssistantOutput(raw: string, mode: ProtocolMode = this.protocolMode): ParsedResult {
    return parseAssistantOutput(raw, mode, { allowedTools: this.allowedTools });
  }

  validateToolCall(call: ToolCallResult): BasicValidationResult {
    return validateToolCall(call, this.modelProfile);
  }

  validateToolCallDetailed(call: ToolCallResult): DetailedValidationResult {
    return validateToolCallDetailed(call, this.modelProfile);
  }

  async executeTool(call: ToolCallResult): Promise<any> {
    const validation = validateToolCallDetailed(call, this.modelProfile);
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

  wrapFunctionResponse(payload: any): string {
    return `${FUNCTION_RESPONSE_START}${JSON.stringify(payload)}${FUNCTION_RESPONSE_END}`;
  }

  convertOfficialToLegacyXml(raw: string): ConvertToXmlResult | ParsedResult {
    const converted = convertOfficialRawToLegacyXml(raw);
    if (converted.ok) {
      return converted;
    }
    return converted.error;
  }

  parseDMindToOpenAIMessage(
    raw: string,
    mode: ProtocolMode = this.protocolMode
  ): OpenAIInteropResult {
    return dmindRawToOpenAIMessage(raw, mode, {
      allowedTools: this.allowedTools
    });
  }

  parseOpenAIToDMindRaw(
    message: OpenAIAssistantMessage,
    protocol: DmindProtocol = "official"
  ): { type: "raw"; raw: string } | ParseErrorResult {
    return openAIAssistantMessageToDMindRaw(message, protocol, {
      allowedTools: this.allowedTools
    });
  }

  wrapToolResponseAsOpenAI(
    toolCallId: string,
    payload: any
  ): OpenAIToolMessage {
    return openAIToolResultMessage(toolCallId, payload);
  }
}
