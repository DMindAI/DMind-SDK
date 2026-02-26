import type { z } from "zod";
import type { ToolDefinition } from "./chat-types";

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export interface ToolExecuteContext {
  numberOfTurns: number;
  toolCallId?: string;
}

export type ToolExecuteFn<TInput, TOutput> = (
  params: TInput,
  context?: ToolExecuteContext,
) => Promise<TOutput> | TOutput;

export type ToolGeneratorFn<TInput, TOutput, TEvent> = (
  params: TInput,
  context?: ToolExecuteContext,
) => AsyncGenerator<TEvent, TOutput, unknown>;

export interface Tool<
  TInput = unknown,
  TOutput = unknown,
  TEvent = never,
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly eventSchema?: z.ZodType<TEvent>;
  readonly execute:
    | ToolExecuteFn<TInput, TOutput>
    | ToolGeneratorFn<TInput, TOutput, TEvent>
    | false;
  readonly type: "regular" | "generator" | "manual";
  toDefinition(): ToolDefinition;
  parseInput(raw: unknown): TInput;
  implement<R = TOutput>(
    fn: ToolExecuteFn<TInput, R>,
  ): Tool<TInput, R, never>;
}

// ---------------------------------------------------------------------------
// Config types for tool()
// ---------------------------------------------------------------------------

interface BaseToolConfig<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  /** Hardcoded JSON Schema parameters for toDefinition(). When set, bypasses Zod toJSONSchema(). */
  jsonSchemaParameters?: Record<string, unknown>;
}

export interface RegularToolConfig<TInput, TOutput>
  extends BaseToolConfig<TInput, TOutput> {
  eventSchema?: undefined;
  execute: ToolExecuteFn<TInput, TOutput>;
}

export interface GeneratorToolConfig<TInput, TOutput, TEvent>
  extends BaseToolConfig<TInput, TOutput> {
  eventSchema: z.ZodType<TEvent>;
  execute: ToolGeneratorFn<TInput, TOutput, TEvent>;
}

export interface ManualToolConfig<TInput, TOutput>
  extends BaseToolConfig<TInput, TOutput> {
  execute: false;
}

export type ToolConfig<TInput, TOutput, TEvent = never> =
  | RegularToolConfig<TInput, TOutput>
  | GeneratorToolConfig<TInput, TOutput, TEvent>
  | ManualToolConfig<TInput, TOutput>;

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

export type InferToolInput<T> = T extends Tool<infer I, any, any> ? I : never;
export type InferToolOutput<T> = T extends Tool<any, infer O, any> ? O : never;
export type InferToolEvent<T> = T extends Tool<any, any, infer E> ? E : never;

// ---------------------------------------------------------------------------
// tool() factory
// ---------------------------------------------------------------------------

function buildDefinition(config: {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  jsonSchemaParameters?: Record<string, unknown>;
}): ToolDefinition {
  let parameters: Record<string, unknown>;

  if (config.jsonSchemaParameters) {
    parameters = config.jsonSchemaParameters;
  } else {
    const jsonSchema = (config.inputSchema as any).toJSONSchema?.();
    const { $schema: _, ...rest } = jsonSchema ?? {};
    parameters = rest;
  }

  return {
    type: "function",
    function: {
      name: config.name,
      description: config.description,
      parameters,
    },
  };
}

function createTool<TInput, TOutput, TEvent = never>(
  config: ToolConfig<TInput, TOutput, TEvent>,
): Tool<TInput, TOutput, TEvent> {
  const resolvedType: Tool["type"] =
    config.execute === false
      ? "manual"
      : config.eventSchema
        ? "generator"
        : "regular";

  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    eventSchema: (config as GeneratorToolConfig<TInput, TOutput, TEvent>)
      .eventSchema,
    execute: config.execute as any,
    type: resolvedType,

    toDefinition(): ToolDefinition {
      return buildDefinition(config);
    },

    parseInput(raw: unknown): TInput {
      return config.inputSchema.parse(raw);
    },

    implement<R = TOutput>(fn: ToolExecuteFn<TInput, R>): Tool<TInput, R, never> {
      return createTool<TInput, R>({
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema,
        jsonSchemaParameters: config.jsonSchemaParameters,
        execute: fn,
      });
    },
  };
}

export function tool<TInput, TOutput>(
  config: RegularToolConfig<TInput, TOutput>,
): Tool<TInput, TOutput, never>;
export function tool<TInput, TOutput, TEvent>(
  config: GeneratorToolConfig<TInput, TOutput, TEvent>,
): Tool<TInput, TOutput, TEvent>;
export function tool<TInput, TOutput>(
  config: ManualToolConfig<TInput, TOutput>,
): Tool<TInput, TOutput, never>;
export function tool<TInput, TOutput, TEvent = never>(
  config: ToolConfig<TInput, TOutput, TEvent>,
): Tool<TInput, TOutput, TEvent> {
  return createTool(config);
}
