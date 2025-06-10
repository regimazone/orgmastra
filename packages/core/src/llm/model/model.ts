import type { ModelMessage, Schema, StopCondition } from 'ai';
import { generateObject, generateText, jsonSchema, stepCountIs, Output, streamObject, streamText } from 'ai';
import {
  AnthropicSchemaCompatLayer,
  applyCompatLayer,
  DeepSeekSchemaCompatLayer,
  GoogleSchemaCompatLayer,
  MetaSchemaCompatLayer,
  OpenAIReasoningSchemaCompatLayer,
  OpenAISchemaCompatLayer,
} from '@mastra/schema-compat';
import type { JSONSchema7 } from 'json-schema';
import type { ZodSchema } from 'zod';
import { z } from 'zod';

import type {
  GenerateReturn,
  LLMInnerStreamOptions,
  LLMStreamObjectOptions,
  LLMStreamOptions,
  LLMTextObjectOptions,
  LLMTextOptions,
  StopConditionArgs,
  StreamReturn,
} from '../';
import type { MastraPrimitives } from '../../action';
import type { MastraLanguageModel } from '../../agent/types';
import { MastraBase } from '../../base';
import { RegisteredLogger } from '../../logger';
import type { Mastra } from '../../mastra';
import type { MastraMemory } from '../../memory/memory';
import type { ConvertedToolSet } from '../../tools';
import { delay } from '../../utils';

type MessageInput = string | string[] | ModelMessage | ModelMessage[];

export class MastraLLM extends MastraBase {
  #model: MastraLanguageModel;
  #mastra?: Mastra;

  constructor({ model, mastra }: { model: MastraLanguageModel; mastra?: Mastra }) {
    super({ name: 'aisdk', component: RegisteredLogger.LLM });

    this.#model = model;

    if (mastra) {
      this.#mastra = mastra;
      if (mastra.getLogger()) {
        this.__setLogger(this.#mastra.getLogger());
      }
    }
  }

  __registerPrimitives(p: MastraPrimitives) {
    if (p.telemetry) {
      this.__setTelemetry(p.telemetry);
    }

    if (p.logger) {
      this.__setLogger(p.logger);
    }
  }

  __registerMastra(p: Mastra) {
    this.#mastra = p;
  }

  getProvider() {
    return this.#model.provider;
  }

  getModelId() {
    return this.#model.modelId;
  }

  getModel() {
    return this.#model;
  }

  // AI SDK v5 removed maxSteps and replaced with stopWhen: stepCountIs(number)
  // This method allows us to keep using maxSteps for now.
  private getStopWhen(args: StopConditionArgs): StopCondition<any> | StopCondition<any>[] | undefined {
    if (args.stopWhen) return args.stopWhen;
    if (args.maxSteps) {
      return stepCountIs(args.maxSteps);
    }
    return stepCountIs(5); // our previous default maxSteps
  }

  private _applySchemaCompat(schema: ZodSchema | JSONSchema7): Schema {
    const model = this.#model;

    const schemaCompatLayers = [];

    if (model) {
      schemaCompatLayers.push(
        new OpenAIReasoningSchemaCompatLayer(model),
        new OpenAISchemaCompatLayer(model),
        new GoogleSchemaCompatLayer(model),
        new AnthropicSchemaCompatLayer(model),
        new DeepSeekSchemaCompatLayer(model),
        new MetaSchemaCompatLayer(model),
      );
    }

    return applyCompatLayer({
      schema: schema as any,
      compatLayers: schemaCompatLayers,
      mode: 'aiSdkSchema',
    });
  }

  async __text<Z extends ZodSchema | JSONSchema7 | undefined>({
    runId,
    messages,
    maxSteps,
    stopWhen,
    tools = {},
    temperature,
    toolChoice = 'auto',
    onStepFinish,
    experimental_output,
    telemetry,
    threadId,
    resourceId,
    memory,
    runtimeContext,
    experimental_activeTools,
    activeTools,
    ...rest
  }: LLMTextOptions<Z> & { memory?: MastraMemory; messages: MessageInput }) {
    const model = this.#model;

    const formattedMessages: ModelMessage[] = this.inputMessagesToModelMessages(messages);

    this.logger.debug(`[LLM] - Generating text`, {
      runId,
      messages,
      maxSteps,
      threadId,
      resourceId,
      tools: Object.keys(tools),
    });

    let schema: z.ZodType<Z> | Schema<Z> | undefined;

    if (experimental_output) {
      this.logger.debug('[LLM] - Using experimental output', {
        runId,
      });
      if (typeof (experimental_output as any).parse === 'function') {
        schema = experimental_output as z.ZodType<Z>;
        if (schema instanceof z.ZodArray) {
          schema = schema._def.type as z.ZodType<Z>;
        }
      } else {
        schema = jsonSchema(experimental_output as JSONSchema7) as Schema<Z>;
      }
    }

    return await generateText<ConvertedToolSet, any, any>({
      ...rest,
      stopWhen: this.getStopWhen({ maxSteps, stopWhen }),
      temperature,
      tools,
      toolChoice,
      experimental_activeTools: experimental_activeTools as string[] | undefined,
      activeTools: activeTools as string[] | undefined,
      onStepFinish: async (props: any) => {
        await onStepFinish?.(props);

        this.logger.debug('[LLM] - Step Change:', {
          text: props?.text,
          toolCalls: props?.toolCalls,
          toolResults: props?.toolResults,
          finishReason: props?.finishReason,
          usage: props?.usage,
          runId,
        });

        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds', { runId });
          await delay(10 * 1000);
        }
      },
      model,
      messages: formattedMessages,
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },
      experimental_output: schema
        ? Output.object({
            schema,
          })
        : undefined,
    });
  }

  async __textObject<T extends ZodSchema | JSONSchema7 | undefined>({
    messages,
    structuredOutput,
    runId,
    temperature,
    telemetry,
    threadId,
    resourceId,
    memory,
    runtimeContext,
    ...rest
  }: LLMTextObjectOptions<T> & { memory?: MastraMemory; messages: MessageInput }) {
    const model = this.#model;

    this.logger.debug(`[LLM] - Generating a text object`, { runId });

    let output: any = 'object';
    if (structuredOutput instanceof z.ZodArray) {
      output = 'array';
      structuredOutput = structuredOutput._def.type;
    }

    const processedSchema = this._applySchemaCompat(structuredOutput!);

    return await generateObject<any, any, any>({
      ...rest,
      temperature,
      model,
      messages,
      output,
      schema: processedSchema as Schema<T>,
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },
    });
  }

  async __stream<Z extends ZodSchema | JSONSchema7 | undefined = undefined>({
    messages,
    onStepFinish,
    onFinish,
    maxSteps,
    stopWhen,
    tools = {},
    runId,
    temperature,
    toolChoice = 'auto',
    experimental_output,
    telemetry,
    threadId,
    resourceId,
    memory,
    runtimeContext,
    ...rest
  }: LLMInnerStreamOptions<Z> & { memory?: MastraMemory; messages: MessageInput }) {
    const model = this.#model;
    const formattedMessages: ModelMessage[] = this.inputMessagesToModelMessages(messages);

    this.logger.debug(`[LLM] - Streaming text`, {
      runId,
      threadId,
      resourceId,
      messages,
      maxSteps,
      tools: Object.keys(tools || {}),
    });

    let schema: z.ZodType<Z> | Schema<Z> | undefined;

    if (experimental_output) {
      this.logger.debug('[LLM] - Using experimental output', {
        runId,
      });
      if (typeof (experimental_output as any).parse === 'function') {
        schema = experimental_output as z.ZodType<Z>;
        if (schema instanceof z.ZodArray) {
          schema = schema._def.type as z.ZodType<Z>;
        }
      } else {
        schema = jsonSchema(experimental_output as JSONSchema7) as Schema<Z>;
      }
    }

    return streamText<ConvertedToolSet, any, any>({
      ...rest,
      model,
      messages: formattedMessages,
      // TODO: without removing these here there's a type error
      experimental_activeTools: undefined,
      activeTools: undefined,
      temperature,
      tools,
      stopWhen: this.getStopWhen({ maxSteps, stopWhen }),
      toolChoice,
      onStepFinish: async (props: any) => {
        await onStepFinish?.(props);

        this.logger.debug('[LLM] - Stream Step Change:', {
          text: props?.text,
          toolCalls: props?.toolCalls,
          toolResults: props?.toolResults,
          finishReason: props?.finishReason,
          usage: props?.usage,
          runId,
        });

        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds', { runId });
          await delay(10 * 1000);
        }
      },
      onFinish: async (props: any) => {
        await onFinish?.(props);

        this.logger.debug('[LLM] - Stream Finished:', {
          text: props?.text,
          toolCalls: props?.toolCalls,
          toolResults: props?.toolResults,
          finishReason: props?.finishReason,
          usage: props?.usage,
          runId,
          threadId,
          resourceId,
        });
      },
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },
      experimental_output: schema
        ? Output.object({
            schema,
          })
        : undefined,
    });
  }

  async __streamObject<T extends ZodSchema | JSONSchema7 | undefined>({
    messages,
    runId,
    runtimeContext,
    threadId,
    resourceId,
    memory,
    temperature,
    onStepFinish,
    onFinish,
    structuredOutput,
    telemetry,
    ...rest
  }: LLMStreamObjectOptions<T> & { memory?: MastraMemory; messages: MessageInput }) {
    const model = this.#model;
    this.logger.debug(`[LLM] - Streaming structured output`, {
      runId,
      messages,
    });

    let output: any = 'object';
    if (structuredOutput instanceof z.ZodArray) {
      output = 'array';
      structuredOutput = structuredOutput._def.type;
    }

    const processedSchema = this._applySchemaCompat(structuredOutput!);

    return streamObject<any, any, any>({
      ...rest,
      messages,
      temperature,
      onFinish: async (props: any) => {
        await onFinish?.(props);

        this.logger.debug('[LLM] - Stream Finished:', {
          text: props?.text,
          toolCalls: props?.toolCalls,
          toolResults: props?.toolResults,
          finishReason: props?.finishReason,
          usage: props?.usage,
          runId,
          threadId,
          resourceId,
        });
      },
      model,
      output,
      schema: processedSchema as Schema<T>,
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },
    });
  }

  async generate<Z extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: MessageInput,
    { output, ...rest }: LLMStreamOptions<Z> & { memory?: MastraMemory },
  ): Promise<GenerateReturn<Z>> {
    if (!output) {
      return (await this.__text({
        messages: this.inputMessagesToModelMessages(messages),
        ...rest,
      })) as unknown as GenerateReturn<Z>;
    }

    return (await this.__textObject({
      messages: this.inputMessagesToModelMessages(messages),
      structuredOutput: output,
      ...rest,
    })) as unknown as GenerateReturn<Z>;
  }

  private inputMessagesToModelMessages(messages: MessageInput): ModelMessage[] {
    const arrayMessages = Array.isArray(messages) ? messages : [messages];
    return arrayMessages.map(m => {
      if (typeof m === `string`) return { role: 'user' as const, content: m };
      return m;
    });
  }
  async stream<Z extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: MessageInput,
    { output, ...rest }: LLMStreamOptions<Z> & { memory?: MastraMemory },
  ) {
    if (!output) {
      return (await this.__stream({
        messages: this.inputMessagesToModelMessages(messages),
        ...rest,
      })) as unknown as StreamReturn<Z>;
    }

    return (await this.__streamObject({
      messages: this.inputMessagesToModelMessages(messages),
      structuredOutput: output,
      ...rest,
    })) as unknown as StreamReturn<Z>;
  }
}
