import { randomUUID } from 'crypto';
import type { CoreMessage, IDGenerator, ToolInvocation, UIMessage } from 'ai';
import type { MastraMessageV1 } from '../../memory';
import { isCoreMessage, isUiMessage } from '../../utils';
import { convertDataContentToBase64String } from './prompt/data-content';

export type MastraMessageContentV2 = {
  format: 2; // format 2 === UIMessage in AI SDK v4
  // TODO: When we bump to AI SDK v5 and make "format: 3" we might need to inline these types with a copy/paste
  parts: UIMessage['parts'];
  experimental_attachments?: UIMessage['experimental_attachments'];
  content?: UIMessage['content'];
  toolInvocations?: UIMessage['toolInvocations'];
  reasoning?: UIMessage['reasoning'];
  annotations?: UIMessage['annotations'];
};

export type MastraMessageV2 = {
  id: string;
  content: MastraMessageContentV2;
  role: 'user' | 'assistant';
  createdAt: Date;
  threadId?: string;
  resourceId?: string;
  type?: string;
};

type MessageInput = UIMessage | CoreMessage | MastraMessageV1 | MastraMessageV2;

export class Message {
  #generateMessageId: IDGenerator;
  #lastCreatedAt?: number;
  _record: MastraMessageV2;
  originalMessage: MessageInput;

  constructor(
    message: string | MessageInput,
    options: {
      threadId?: string;
      resourceId?: string;
      generateMessageId?: IDGenerator;
    } = {},
  ) {
    const { threadId, resourceId, generateMessageId } = options;
    this.#generateMessageId = generateMessageId ?? (() => randomUUID());

    // Convert input messages to MastraMessageV2 format
    const normalizedMessage = typeof message === 'string' ? { role: 'user' as const, content: message } : message;

    // needed for messageList I guess, TODO chat with Tyler
    this.originalMessage = normalizedMessage;
    this._record = this.inputToMastraMessageV2(normalizedMessage, { threadId, resourceId });
  }

  get id(): string {
    console.trace('id', this);
    return this._record.id;
  }

  set id(id: string) {
    // console.trace('id');
  }

  get content(): MastraMessageContentV2 {
    return this._record.content;
  }

  set content(content: MastraMessageContentV2) {
    this._record.content = content;
  }

  get role(): 'user' | 'assistant' {
    return this._record.role;
  }

  get createdAt(): Date {
    return this._record.createdAt;
  }

  set createdAt(createdAt: Date | number) {
    console.log('createdAt', createdAt);
    //this._record.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  get threadId(): string | undefined {
    return this._record.threadId;
  }

  get resourceId(): string | undefined {
    return this._record.resourceId;
  }

  get type(): string | undefined {
    return this._record.type;
  }

  public toJSON(): MastraMessageV2 {
    return this._record;
  }

  private inputToMastraMessageV2(
    message: MessageInput,
    { threadId, resourceId }: { threadId?: string; resourceId?: string },
  ): MastraMessageV2 {
    if (`threadId` in message && message.threadId && threadId && message.threadId !== threadId) {
      throw new Error(`Received input message with wrong threadId. Input ${message.threadId}, expected ${threadId}`);
    }

    if (`resourceId` in message && message.resourceId && resourceId && message.resourceId !== resourceId) {
      throw new Error(
        `Received input message with wrong resourceId. Input ${message.resourceId}, expected ${resourceId}`,
      );
    }

    if (Message.isMastraMessageV1(message)) {
      return this.mastraMessageV1ToMastraMessageV2(message, { threadId, resourceId });
    }
    if (Message.isMastraMessageV2(message)) {
      return this.hydrateMastraMessageV2Fields(message);
    }
    if (Message.isVercelCoreMessage(message)) {
      return this.vercelCoreMessageToMastraMessageV2(message, { threadId, resourceId });
    }
    if (Message.isVercelUIMessage(message)) {
      return this.vercelUIMessageToMastraMessageV2(message, { threadId, resourceId });
    }

    throw new Error(`Found unhandled message ${JSON.stringify(message)}`);
  }

  private generateCreatedAt(start?: Date | number): Date {
    start = start instanceof Date ? start : start ? new Date(start) : undefined;

    if (start && !this.#lastCreatedAt) {
      this.#lastCreatedAt = start.getTime();
      return start;
    }

    const now = new Date();
    const nowTime = start?.getTime() || now.getTime();

    // make sure our new message is created later than the latest known message time
    if (this.#lastCreatedAt && nowTime <= this.#lastCreatedAt) {
      const newDate = new Date(this.#lastCreatedAt + 1);
      this.#lastCreatedAt = newDate.getTime();
      return newDate;
    }

    this.#lastCreatedAt = nowTime;
    return now;
  }

  private mastraMessageV1ToMastraMessageV2(
    message: MastraMessageV1,
    { threadId, resourceId }: { threadId?: string; resourceId?: string },
  ): MastraMessageV2 {
    const coreV2 = this.vercelCoreMessageToMastraMessageV2(
      {
        content: message.content,
        role: message.role,
      } as CoreMessage,
      { threadId, resourceId },
    );

    return {
      id: message.id,
      role: coreV2.role,
      createdAt: this.generateCreatedAt(message.createdAt),
      threadId: coreV2.threadId,
      resourceId: coreV2.resourceId,
      content: coreV2.content,
    };
  }

  private hydrateMastraMessageV2Fields(message: MastraMessageV2): MastraMessageV2 {
    if (!(message.createdAt instanceof Date)) message.createdAt = new Date(message.createdAt);
    return message;
  }

  private vercelUIMessageToMastraMessageV2(
    message: UIMessage,
    { threadId, resourceId }: { threadId?: string; resourceId?: string },
  ): MastraMessageV2 {
    const content: MastraMessageContentV2 = {
      format: 2,
      parts: message.parts,
    };

    if (message.toolInvocations) content.toolInvocations = message.toolInvocations;
    if (message.reasoning) content.reasoning = message.reasoning;
    if (message.annotations) content.annotations = message.annotations;
    if (message.experimental_attachments) {
      content.experimental_attachments = message.experimental_attachments;
    }

    return {
      id: message.id || this.#generateMessageId(),
      role: Message.getRole(message),
      createdAt: this.generateCreatedAt(message.createdAt),
      threadId,
      resourceId,
      content,
    } satisfies MastraMessageV2;
  }

  private vercelCoreMessageToMastraMessageV2(
    coreMessage: CoreMessage,
    { threadId, resourceId }: { threadId?: string; resourceId?: string },
  ): MastraMessageV2 {
    const id = `id` in coreMessage ? (coreMessage.id as string) : this.#generateMessageId();
    const parts: UIMessage['parts'] = [];
    const experimentalAttachments: UIMessage['experimental_attachments'] = [];
    const toolInvocations: ToolInvocation[] = [];

    if (typeof coreMessage.content === 'string') {
      parts.push({ type: 'step-start' });
      parts.push({
        type: 'text',
        text: coreMessage.content,
      });
    } else if (Array.isArray(coreMessage.content)) {
      for (const part of coreMessage.content) {
        switch (part.type) {
          case 'text':
            parts.push({
              type: 'text',
              text: part.text,
            });
            break;

          case 'tool-call':
            parts.push({
              type: 'tool-invocation',
              toolInvocation: {
                state: 'call',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args,
              },
            });
            break;

          case 'tool-result':
            const invocation = {
              state: 'result' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result ?? '', // undefined will cause AI SDK to throw an error, but for client side tool calls this really could be undefined
              args: {}, // when we combine this invocation onto the existing tool-call part it will have args already
            };
            parts.push({
              type: 'tool-invocation',
              toolInvocation: invocation,
            });
            toolInvocations.push(invocation);
            break;

          case 'reasoning':
            // CoreMessage reasoning parts have text and signature
            parts.push({
              type: 'reasoning',
              reasoning: part.text, // Assuming text is the main reasoning content
              details: [{ type: 'text', text: part.text, signature: part.signature }],
            });
            break;
          case 'redacted-reasoning':
            // CoreMessage redacted-reasoning parts have data
            parts.push({
              type: 'reasoning',
              reasoning: '', // No text reasoning for redacted parts
              details: [{ type: 'redacted', data: part.data }],
            });
            break;
          case 'file':
            // CoreMessage file parts can have mimeType and data (binary/data URL) or just a URL
            if (part.data instanceof URL) {
              // If it's a non-data URL, add to experimental_attachments
              if (part.data.protocol !== 'data:') {
                experimentalAttachments.push({
                  name: part.filename,
                  url: part.data.toString(),
                  contentType: part.mimeType,
                });
              } else {
                // If it's a data URL, extract the base64 data and add to parts
                try {
                  const base64Match = part.data.toString().match(/^data:[^;]+;base64,(.+)$/);
                  if (base64Match && base64Match[1]) {
                    parts.push({
                      type: 'file',
                      mimeType: part.mimeType,
                      data: base64Match[1],
                    });
                  } else {
                    console.error(`Invalid data URL format: ${part.data}`);
                  }
                } catch (error) {
                  console.error(`Failed to process data URL in CoreMessage file part: ${error}`, error);
                }
              }
            } else {
              // If it's binary data, convert to base64 and add to parts
              try {
                parts.push({
                  type: 'file',
                  mimeType: part.mimeType,
                  data: convertDataContentToBase64String(part.data),
                });
              } catch (error) {
                console.error(`Failed to convert binary data to base64 in CoreMessage file part: ${error}`, error);
              }
            }
            break;
          default:
            throw new Error(`Found unknown CoreMessage content part type: ${part.type}`);
        }
      }
    }

    const content: MastraMessageV2['content'] = {
      format: 2,
      parts,
    };

    if (toolInvocations.length) content.toolInvocations = toolInvocations;
    if (typeof coreMessage.content === `string`) content.content = coreMessage.content;
    if (experimentalAttachments.length) content.experimental_attachments = experimentalAttachments;

    return {
      id,
      role: Message.getRole(coreMessage),
      createdAt: this.generateCreatedAt(),
      threadId,
      resourceId,
      content,
    };
  }

  static isVercelUIMessage(msg: MessageInput): msg is UIMessage {
    return !Message.isMastraMessage(msg) && isUiMessage(msg);
  }

  static isVercelCoreMessage(msg: MessageInput): msg is CoreMessage {
    return !Message.isMastraMessage(msg) && isCoreMessage(msg);
  }

  static isMastraMessage(msg: MessageInput): msg is MastraMessageV2 | MastraMessageV1 {
    return Message.isMastraMessageV2(msg) || Message.isMastraMessageV1(msg);
  }

  static isMastraMessageV1(msg: MessageInput): msg is MastraMessageV1 {
    return !Message.isMastraMessageV2(msg) && (`threadId` in msg || `resourceId` in msg);
  }

  static isMastraMessageV2(msg: MessageInput): msg is MastraMessageV2 {
    return Boolean(
      msg.content &&
        !Array.isArray(msg.content) &&
        typeof msg.content !== `string` &&
        // any newly saved Mastra message v2 shape will have content: { format: 2 }
        `format` in msg.content &&
        msg.content.format === 2,
    );
  }

  private static getRole(message: MessageInput): MastraMessageV2['role'] {
    if (message.role === `assistant` || message.role === `system` || message.role === `tool`) return `assistant`;
    if (message.role === `user`) return `user`;
    // TODO: how should we handle data role?
    throw new Error(
      `BUG: add handling for message role ${message.role} in message ${JSON.stringify(message, null, 2)}`,
    );
  }
}
