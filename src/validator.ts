import type { ValidationIssue } from "./errors";
import { DMIND_3_NANO_PROFILE } from "./profiles";
import type {
  BasicValidationResult,
  DetailedValidationResult,
  ModelProfile,
  ToolCallResult,
  ToolParameterSchema
} from "./types";
import { isFiniteNumber, isPlainObject } from "./utils";

function push(
  errors: ValidationIssue[],
  code: ValidationIssue["code"],
  message: string
): void {
  errors.push({ code, message });
}

function validateByType(
  key: string,
  value: unknown,
  schema: ToolParameterSchema,
  errors: ValidationIssue[]
): void {
  if (schema.type === "string") {
    if (typeof value !== "string") {
      push(errors, "E_PARAM_INVALID", `${key} must be a string.`);
      return;
    }
    if (schema.nonEmpty && value.trim().length === 0) {
      push(errors, "E_PARAM_INVALID", `${key} must be a non-empty string.`);
      return;
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        push(errors, "E_PARAM_INVALID", `${key} does not match pattern ${schema.pattern}.`);
      }
    }
    return;
  }

  if (schema.type === "number") {
    if (!isFiniteNumber(value)) {
      push(errors, "E_PARAM_INVALID", `${key} must be a number.`);
      return;
    }
    if (schema.min !== undefined && value < schema.min) {
      push(errors, "E_PARAM_INVALID", `${key} must be >= ${schema.min}.`);
    }
    if (schema.max !== undefined && value > schema.max) {
      push(errors, "E_PARAM_INVALID", `${key} must be <= ${schema.max}.`);
    }
    return;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      push(errors, "E_PARAM_INVALID", `${key} must be a boolean.`);
    }
    return;
  }

  if (!isPlainObject(value)) {
    push(errors, "E_PARAM_INVALID", `${key} must be an object.`);
  }
}

function validateEnum(
  key: string,
  value: unknown,
  schema: ToolParameterSchema,
  errors: ValidationIssue[]
): void {
  if (!schema.enum) {
    return;
  }
  if (!schema.enum.includes(value as string | number | boolean)) {
    push(
      errors,
      "E_PARAM_INVALID",
      `${key} must be one of: ${schema.enum.join(", ")}.`
    );
  }
}

export function validateDetailed(
  call: ToolCallResult,
  profile: ModelProfile = DMIND_3_NANO_PROFILE
): DetailedValidationResult {
  const errors: ValidationIssue[] = [];
  const schema = profile.tools[call.tool];

  if (!schema) {
    push(
      errors,
      "E_TOOL_UNKNOWN",
      `Tool ${call.tool} is not defined in profile ${profile.id}.`
    );
    return { ok: false, errors };
  }

  const args = call.args ?? {};
  const parameterEntries = Object.entries(schema.parameters);

  for (const [key, paramSchema] of parameterEntries) {
    if (paramSchema.required && args[key] === undefined) {
      push(errors, "E_PARAM_MISSING", `${key} is required for ${call.tool}.`);
    }
  }

  if (schema.strict ?? true) {
    for (const key of Object.keys(args)) {
      if (!(key in schema.parameters)) {
        push(errors, "E_PARAM_FORBIDDEN", `${call.tool} does not allow parameter: ${key}.`);
      }
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const paramSchema = schema.parameters[key];
    if (!paramSchema) {
      continue;
    }
    validateByType(key, value, paramSchema, errors);
    validateEnum(key, value, paramSchema, errors);
  }

  if (schema.customValidate) {
    errors.push(...schema.customValidate(args));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

export function validate(
  call: ToolCallResult,
  profile: ModelProfile = DMIND_3_NANO_PROFILE
): BasicValidationResult {
  const detailed = validateDetailed(call, profile);
  if (detailed.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    errors: detailed.errors.map((item) => `${item.code}: ${item.message}`)
  };
}
