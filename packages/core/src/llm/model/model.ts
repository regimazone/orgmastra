import type { ModelMessage, Schema, StopCondition } from 'ai';
import { generateObject, generateText, jsonSchema, stepCountIs, Output, streamObject, streamText } from 'ai';
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
import { delay } from '../../utils';

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

  async __text<Z extends ZodSchema | JSONSchema7 | undefined>({
    runId,
    messages,
    maxSteps,
    stopWhen,
    // tools = {},
    temperature,
    toolChoice = 'auto',
    onStepFinish,
    experimental_output,
    telemetry,
    threadId,
    resourceId,
    memory,
    runtimeContext,
    ...rest
  }: LLMTextOptions<Z> & { memory?: MastraMemory }) {
    const model = this.#model;

    this.logger.debug(`[LLM] - Generating text`, {
      runId,
      messages,
      maxSteps,
      threadId,
      resourceId,
      // tools: Object.keys(tools),
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

    return await generateText<any, any, any>({
      ...rest,
      stopWhen: this.getStopWhen({ maxSteps, stopWhen }),
      temperature,
      //   tools: {
      //     ...tools,
      //   },
      toolChoice,
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
      messages: messages as ModelMessage[],
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
    // onStepFinish,
    // maxSteps = 5,
    // tools = {},
    // toolChoice = 'auto',
    ...rest
  }: LLMTextObjectOptions<T> & { memory?: MastraMemory }) {
    const model = this.#model;

    this.logger.debug(`[LLM] - Generating a text object`, { runId });

    let schema: z.ZodType<T> | Schema<T>;
    let output = 'object';

    if (typeof (structuredOutput as any).parse === 'function') {
      schema = structuredOutput as z.ZodType<T>;
      if (schema instanceof z.ZodArray) {
        output = 'array';
        schema = schema._def.type as z.ZodType<T>;
      }
    } else {
      schema = jsonSchema(structuredOutput as JSONSchema7) as Schema<T>;
    }

    return await generateObject<any, any, any>({
      ...rest,
      temperature,
      model,
      messages,
      output,
      schema,
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },
      // TODO: why are these options no longer present on generateObject input args?
      // Is it because generateObject just does a one step generate object??
      //
      // tools: {
      //   ...tools,
      // },
      // toolChoice,
      // onStepFinish: async (props: any) => {
      //   await onStepFinish?.(props);
      //
      //   this.logger.debug('[LLM] - Step Change:', {
      //     text: props?.text,
      //     toolCalls: props?.toolCalls,
      //     toolResults: props?.toolResults,
      //     finishReason: props?.finishReason,
      //     usage: props?.usage,
      //     runId,
      //   });
      //
      //   if (
      //     props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
      //     parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
      //   ) {
      //     this.logger.warn('Rate limit approaching, waiting 10 seconds', { runId });
      //     await delay(10 * 1000);
      //   }
      // },
    });
  }

  async __stream<Z extends ZodSchema | JSONSchema7 | undefined = undefined>({
    messages,
    onStepFinish,
    onFinish,
    maxSteps,
    stopWhen,
    // tools = {},
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
  }: LLMInnerStreamOptions<Z> & { memory?: MastraMemory }) {
    const model = this.#model;
    this.logger.debug(`[LLM] - Streaming text`, {
      runId,
      threadId,
      resourceId,
      messages,
      maxSteps,
      // tools: Object.keys(tools || {}),
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

    return streamText<any, any, any>({
      ...rest,
      model,
      messages,
      temperature,
      // tools: {
      //   ...tools,
      // },
      // maxSteps,
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
    // tools = {},
    // maxSteps = 5,
    // toolChoice = 'auto',
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
  }: LLMStreamObjectOptions<T> & { memory?: MastraMemory }) {
    const model = this.#model;
    this.logger.debug(`[LLM] - Streaming structured output`, {
      runId,
      messages,
      // maxSteps,
      // tools: Object.keys(tools || {}),
    });

    // const finalTools = tools;

    let schema: z.ZodType<T> | Schema<T>;
    let output = 'object';

    if (typeof (structuredOutput as any).parse === 'function') {
      schema = structuredOutput as z.ZodType<T>;
      if (schema instanceof z.ZodArray) {
        output = 'array';
        schema = schema._def.type as z.ZodType<T>;
      }
    } else {
      schema = jsonSchema(structuredOutput as JSONSchema7) as Schema<T>;
    }

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
      output: output as any,
      schema,
      experimental_telemetry: {
        ...this.experimental_telemetry,
        ...telemetry,
      },

      // TODO: seems these aren't supported anymore
      //
      // tools: {
      //   ...finalTools,
      // },
      // maxSteps,
      // toolChoice,
      // onStepFinish: async (props: any) => {
      //   await onStepFinish?.(props);
      //
      //   this.logger.debug('[LLM] - Stream Step Change:', {
      //     text: props?.text,
      //     toolCalls: props?.toolCalls,
      //     toolResults: props?.toolResults,
      //     finishReason: props?.finishReason,
      //     usage: props?.usage,
      //     runId,
      //     threadId,
      //     resourceId,
      //   });
      //
      //   if (
      //     props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
      //     parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
      //   ) {
      //     this.logger.warn('Rate limit approaching, waiting 10 seconds', { runId });
      //     await delay(10 * 1000);
      //   }
      // },
    });
  }

  async generate<Z extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: ModelMessage[],
    { output, ...rest }: LLMStreamOptions<Z> & { memory?: MastraMemory },
  ): Promise<GenerateReturn<Z>> {
    if (!output) {
      return (await this.__text({
        messages,
        ...rest,
      })) as unknown as GenerateReturn<Z>;
    }

    return (await this.__textObject({
      messages,
      structuredOutput: output,
      ...rest,
    })) as unknown as GenerateReturn<Z>;
  }

  async stream<Z extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: ModelMessage[],
    { output, ...rest }: LLMStreamOptions<Z> & { memory?: MastraMemory },
  ) {
    if (!output) {
      return (await this.__stream({
        messages,
        ...rest,
      })) as unknown as StreamReturn<Z>;
    }

    return (await this.__streamObject({
      messages,
      structuredOutput: output,
      ...rest,
    })) as unknown as StreamReturn<Z>;
  }
}
