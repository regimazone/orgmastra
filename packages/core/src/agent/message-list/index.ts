import { convertToCoreMessages } from 'ai';
import type { CoreMessage, CoreSystemMessage, IDGenerator, UIMessage } from 'ai';
import type { MastraMessageV1 } from '../../memory';
import { Message } from './message';
import { convertToV1Messages } from './prompt/convert-to-mastra-v1';

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

type MessageInput = UIMessage | Message | MastraMessageV1 | CoreMessage | MastraMessageV2;
type MessageSource = 'memory' | 'response' | 'user' | 'system';
type MemoryInfo = { threadId: string; resourceId?: string };

export class MessageList {
  private messages: Message[] = [];

  // passed in by dev in input or context
  private systemMessages: CoreSystemMessage[] = [];
  // passed in by us for a specific purpose, eg memory system message
  private taggedSystemMessages: Record<string, CoreSystemMessage[]> = {};

  private memoryInfo: null | MemoryInfo = null;

  // used to filter this.messages by how it was added: input/response/memory
  private memoryMessages = new Set<MastraMessageV2>();
  private newUserMessages = new Set<MastraMessageV2>();
  private newResponseMessages = new Set<MastraMessageV2>();

  private generateMessageId?: IDGenerator;

  constructor({
    threadId,
    resourceId,
    generateMessageId,
  }: { threadId?: string; resourceId?: string; generateMessageId?: IDGenerator } = {}) {
    if (threadId) {
      this.memoryInfo = { threadId, resourceId };
      this.generateMessageId = generateMessageId;
    }
  }

  public add(messages: Message | Message[], messageSource: MessageSource) {
    for (const message of Array.isArray(messages) ? messages : [messages]) {
      this.addOne(message, messageSource);
    }
    return this;
  }
  public getLatestUserContent(): string | null {
    const currentUserMessages = this.all.core().filter(m => m.role === 'user');
    const content = currentUserMessages.at(-1)?.content;
    if (!content) return null;
    return MessageList.coreContentToString(content);
  }
  public get get() {
    return {
      all: this.all,
      remembered: this.remembered,
      input: this.input,
      response: this.response,
    };
  }
  private all = {
    v2: () => this.messages,
    v1: () => convertToV1Messages(this.messages),
    ui: () => this.messages.map(MessageList.toUIMessage),
    core: () => this.convertToCoreMessages(this.all.ui()),
    prompt: () => {
      return [...this.systemMessages, ...Object.values(this.taggedSystemMessages).flat(), ...this.all.core()];
    },
  };
  private remembered = {
    v2: () => this.messages.filter(m => this.memoryMessages.has(m)),
    v1: () => convertToV1Messages(this.remembered.v2()),
    ui: () => this.remembered.v2().map(MessageList.toUIMessage),
    core: () => this.convertToCoreMessages(this.remembered.ui()),
  };
  private input = {
    v2: () => this.messages.filter(m => this.newUserMessages.has(m)),
    v1: () => convertToV1Messages(this.input.v2()),
    ui: () => this.input.v2().map(MessageList.toUIMessage),
    core: () => this.convertToCoreMessages(this.input.ui()),
  };
  private response = {
    v2: () => this.messages.filter(m => this.newResponseMessages.has(m)),
  };
  public drainUnsavedMessages(): MastraMessageV2[] {
    const messages = this.messages.filter(m => this.newUserMessages.has(m) || this.newResponseMessages.has(m));
    this.newUserMessages.clear();
    this.newResponseMessages.clear();
    return messages;
  }
  public getSystemMessages(tag?: string): CoreMessage[] {
    if (tag) {
      return this.taggedSystemMessages[tag] || [];
    }
    return this.systemMessages;
  }
  public addSystem(messages: CoreSystemMessage | CoreSystemMessage[] | string | string[] | null, tag?: string) {
    if (!messages) return this;
    for (const message of Array.isArray(messages) ? messages : [messages]) {
      this.addOneSystem(message, tag);
    }
    return this;
  }

  private convertToCoreMessages(messages: UIMessage[]): CoreMessage[] {
    return convertToCoreMessages(this.sanitizeUIMessages(messages));
  }
  private sanitizeUIMessages(messages: UIMessage[]): UIMessage[] {
    const msgs = messages
      .map(m => {
        if (m.parts.length === 0) return false;
        const safeParts = m.parts.filter(
          p =>
            p.type !== `tool-invocation` ||
            // calls and partial-calls should be updated to be results at this point
            // if they haven't we can't send them back to the llm and need to remove them.
            (p.toolInvocation.state !== `call` && p.toolInvocation.state !== `partial-call`),
        );

        // fully remove this message if it has an empty parts array after stripping out incomplete tool calls.
        if (!safeParts.length) return false;

        const sanitized = {
          ...m,
          parts: safeParts,
        };

        // ensure toolInvocations are also updated to only show results
        if (`toolInvocations` in m && m.toolInvocations) {
          sanitized.toolInvocations = m.toolInvocations.filter(t => t.state === `result`);
        }

        return sanitized;
      })
      .filter((m): m is UIMessage => Boolean(m));
    return msgs;
  }
  private addOneSystem(message: CoreSystemMessage | string, tag?: string) {
    if (typeof message === `string`) message = { role: 'system', content: message };
    if (tag && !this.isDuplicateSystem(message, tag)) {
      this.taggedSystemMessages[tag] ||= [];
      this.taggedSystemMessages[tag].push(message);
    } else if (!this.isDuplicateSystem(message)) {
      this.systemMessages.push(message);
    }
  }
  private isDuplicateSystem(message: CoreSystemMessage, tag?: string) {
    if (tag) {
      if (!this.taggedSystemMessages[tag]) return false;
      return this.taggedSystemMessages[tag].some(
        m => MessageList.cacheKeyFromContent(m.content) === MessageList.cacheKeyFromContent(message.content),
      );
    }
    return this.systemMessages.some(
      m => MessageList.cacheKeyFromContent(m.content) === MessageList.cacheKeyFromContent(message.content),
    );
  }
  private static toUIMessage(m: MastraMessageV2): UIMessage {
    const contentString =
      typeof m.content.content === `string` && m.content.content !== ''
        ? m.content.content
        : m.content.parts.reduce((prev, part) => {
            if (part.type === `text`) {
              // return only the last text part like AI SDK does
              return part.text;
            }
            return prev;
          }, '');

    if (m.role === `user`) {
      return {
        id: m.id,
        role: m.role,
        content: m.content.content || contentString,
        createdAt: m.createdAt,
        parts: m.content.parts,
        experimental_attachments: m.content.experimental_attachments || [],
      };
    } else if (m.role === `assistant`) {
      return {
        id: m.id,
        role: m.role,
        content: m.content.content || contentString,
        createdAt: m.createdAt,
        parts: m.content.parts,
        reasoning: undefined,
        toolInvocations: `toolInvocations` in m.content ? m.content.toolInvocations : undefined,
      };
    }

    return {
      id: m.id,
      role: m.role,
      content: m.content.content || contentString,
      createdAt: m.createdAt,
      parts: m.content.parts,
    };
  }
  private getMessageById(id: string) {
    return this.messages.find(m => m.id === id);
  }
  private shouldReplaceMessage(message: Message): { exists: boolean; shouldReplace?: boolean; id?: string } {
    if (!this.messages.length) return { exists: false };

    if (!(`id` in message) || !message?.id) {
      return { exists: false };
    }

    const existingMessage = this.getMessageById(message.id);
    if (!existingMessage) return { exists: false };

    return {
      exists: true,
      shouldReplace: !MessageList.messagesAreEqual(existingMessage, message),
      id: existingMessage.id,
    };
  }
  private addOne(message: Message, messageSource: MessageSource) {
    if (message.originalMessage.role === `system` && Message.isVercelCoreMessage(message.originalMessage))
      return this.addSystem(message.originalMessage);
    if (message.originalMessage.role === `system`) {
      throw new Error(
        `A non-CoreMessage system message was added - this is not supported as we didn't expect this could happen. Please open a Github issue and let us know what you did to get here. This is the non-CoreMessage system message we received:

messageSource: ${messageSource}

${JSON.stringify(message.originalMessage, null, 2)}`,
      );
    }

    const { exists, shouldReplace, id } = this.shouldReplaceMessage(message);

    const latestMessage = this.messages.at(-1);

    const singleToolResult =
      message.role === `assistant` &&
      message.content.parts.length === 1 &&
      message.content.parts[0] &&
      message.content.parts[0].type === `tool-invocation` &&
      message.content.parts[0].toolInvocation.state === `result`;

    if (
      singleToolResult &&
      (latestMessage?.role !== `assistant` ||
        !latestMessage.content.parts.some(
          p =>
            p.type === `tool-invocation` && p.toolInvocation.toolCallId === singleToolResult.toolInvocation.toolCallId,
        ))
    ) {
      // remove any tool results that aren't updating a tool call
      return;
    }

    if (messageSource === `memory`) {
      for (const existingMessage of this.messages) {
        // don't double store any messages
        if (MessageList.messagesAreEqual(existingMessage, message)) {
          return;
        }
      }
    }
    // If the last message is an assistant message and the new message is also an assistant message, merge them together and update tool calls with results
    const latestMessagePartType = latestMessage?.content?.parts?.filter(p => p.type !== `step-start`)?.at?.(-1)?.type;
    const newMessageFirstPartType = message.content.parts.filter(p => p.type !== `step-start`).at(0)?.type;
    const shouldAppendToLastAssistantMessage = latestMessage?.role === 'assistant' && message.role === 'assistant';
    const shouldAppendToLastAssistantMessageParts =
      shouldAppendToLastAssistantMessage &&
      newMessageFirstPartType &&
      ((newMessageFirstPartType === `tool-invocation` && latestMessagePartType !== `text`) ||
        newMessageFirstPartType === latestMessagePartType);

    if (
      // backwards compat check!
      // this condition can technically be removed and it will make it so all new assistant parts will be added to the last assistant message parts instead of creating new db entries.
      // however, for any downstream code that isn't based around using message parts yet, this may cause tool invocations to show up in the wrong order in their UI, because they use the message.toolInvocations and message.content properties which do not indicate how each is ordered in relation to each other.
      // this code check then causes any tool invocation to be created as a new message and not update the previous assistant message parts.
      // without this condition we will see something like
      // parts: [{type:"step-start"}, {type: "text", text: "let me check the weather"}, {type: "tool-invocation", toolInvocation: x}, {type: "text", text: "the weather in x is y"}]
      // with this condition we will see
      // message1.parts: [{type:"step-start"}, {type: "text", text: "let me check the weather"}]
      // message2.parts: [{type: "tool-invocation", toolInvocation: x}]
      // message3.parts: [{type: "text", text: "the weather in x is y"}]
      shouldAppendToLastAssistantMessageParts
    ) {
      latestMessage.createdAt = message.createdAt || latestMessage.createdAt;

      for (const [index, part] of message.content.parts.entries()) {
        // If the incoming part is a tool-invocation result, find the corresponding call in the latest message
        if (part.type === 'tool-invocation' && part.toolInvocation.state === 'result') {
          const existingCallPart = [...latestMessage.content.parts]
            .reverse()
            .find(p => p.type === 'tool-invocation' && p.toolInvocation.toolCallId === part.toolInvocation.toolCallId);

          if (existingCallPart && existingCallPart.type === 'tool-invocation') {
            // Update the existing tool-call part with the result
            existingCallPart.toolInvocation = {
              ...existingCallPart.toolInvocation,
              state: 'result',
              result: part.toolInvocation.result,
            };
            if (!latestMessage.content.toolInvocations) {
              latestMessage.content.toolInvocations = [];
            }
            if (
              !latestMessage.content.toolInvocations.some(
                t => t.toolCallId === existingCallPart.toolInvocation.toolCallId,
              )
            ) {
              latestMessage.content.toolInvocations.push(existingCallPart.toolInvocation);
            }
          }
        } else if (
          // if there's no part at this index yet in the existing message we're merging into
          !latestMessage.content.parts[index] ||
          // or there is and the parts are not identical
          MessageList.cacheKeyFromParts([latestMessage.content.parts[index]]) !== MessageList.cacheKeyFromParts([part])
        ) {
          // For all other part types that aren't already present, simply push them to the latest message's parts
          latestMessage.content.parts.push(part);
        }
      }
      if (latestMessage.createdAt.getTime() < message.createdAt.getTime()) {
        latestMessage.createdAt = message.createdAt;
      }
      if (!latestMessage.content.content && message.content.content) {
        latestMessage.content.content = message.content.content;
      }
      if (
        latestMessage.content.content &&
        message.content.content &&
        latestMessage.content.content !== message.content.content
      ) {
        // Match what AI SDK does - content string is always the latest text part.
        latestMessage.content.content = message.content.content;
      }
    }
    // Else the last message and this message are not both assistant messages OR an existing message has been updated and should be replaced. add a new message to the array or update an existing one.
    else {
      if (message.role === 'assistant' && message.content.parts[0]?.type !== `step-start`) {
        // Add step-start part for new assistant messages
        message.content.parts.unshift({ type: 'step-start' });
      }

      const existingIndex = (shouldReplace && this.messages.findIndex(m => m.id === id)) || -1;
      const existingMessage = existingIndex !== -1 && this.messages[existingIndex];

      if (shouldReplace && existingMessage) {
        this.messages[existingIndex] = message;
      } else if (!exists) {
        this.messages.push(message);
      }

      if (messageSource === `memory`) {
        this.memoryMessages.add(message);
      } else if (messageSource === `response`) {
        this.newResponseMessages.add(message);
      } else if (messageSource === `user`) {
        this.newUserMessages.add(message);
      } else {
        throw new Error(`Missing message source for message ${message}`);
      }
    }

    // make sure messages are always stored in order of when they were created!
    this.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return this;
  }

  private static cacheKeyFromParts(parts: UIMessage['parts']): string {
    let key = ``;
    for (const part of parts) {
      key += part.type;
      if (part.type === `text`) {
        key += part.text.length;
      }
      if (part.type === `tool-invocation`) {
        key += part.toolInvocation.toolCallId;
        key += part.toolInvocation.state;
      }
      if (part.type === `reasoning`) {
        key += part.reasoning.length;
      }
      if (part.type === `file`) {
        key += part.data.length;
        key += part.mimeType;
      }
    }
    return key;
  }
  private static coreContentToString(content: CoreMessage['content']): string {
    if (typeof content === `string`) return content;

    return content.reduce((p, c) => {
      if (c.type === `text`) {
        p += c.text;
      }
      return p;
    }, '');
  }
  private static cacheKeyFromContent(content: CoreMessage['content']): string {
    if (typeof content === `string`) return content;
    let key = ``;
    for (const part of content) {
      key += part.type;
      if (part.type === `text`) {
        key += part.text.length;
      }
      if (part.type === `reasoning`) {
        key += part.text.length;
      }
      if (part.type === `tool-call`) {
        key += part.toolCallId;
        key += part.toolName;
      }
      if (part.type === `tool-result`) {
        key += part.toolCallId;
        key += part.toolName;
      }
      if (part.type === `file`) {
        key += part.filename;
        key += part.mimeType;
      }
      if (part.type === `image`) {
        key += part.image instanceof URL ? part.image.toString() : part.image.toString().length;
        key += part.mimeType;
      }
      if (part.type === `redacted-reasoning`) {
        key += part.data.length;
      }
    }
    return key;
  }
  private static messagesAreEqual(one: MessageInput, two: MessageInput) {
    const oneUI = Message.isVercelUIMessage(one) && one;
    const twoUI = Message.isVercelUIMessage(two) && two;
    if (oneUI && !twoUI) return false;
    if (oneUI && twoUI) {
      return MessageList.cacheKeyFromParts(one.parts) === MessageList.cacheKeyFromParts(two.parts);
    }

    const oneCM = Message.isVercelCoreMessage(one) && one;
    const twoCM = Message.isVercelCoreMessage(two) && two;
    if (oneCM && !twoCM) return false;
    if (oneCM && twoCM) {
      return MessageList.cacheKeyFromContent(oneCM.content) === MessageList.cacheKeyFromContent(twoCM.content);
    }

    const oneMM1 = Message.isMastraMessageV1(one) && one;
    const twoMM1 = Message.isMastraMessageV1(two) && two;
    if (oneMM1 && !twoMM1) return false;
    if (oneMM1 && twoMM1) {
      return (
        oneMM1.id === twoMM1.id &&
        MessageList.cacheKeyFromContent(oneMM1.content) === MessageList.cacheKeyFromContent(twoMM1.content)
      );
    }

    const oneMM2 = Message.isMastraMessageV2(one) && one;
    const twoMM2 = Message.isMastraMessageV2(two) && two;
    if (oneMM2 && !twoMM2) return false;
    if (oneMM2 && twoMM2) {
      return (
        oneMM2.id === twoMM2.id &&
        MessageList.cacheKeyFromParts(oneMM2.content.parts) === MessageList.cacheKeyFromParts(twoMM2.content.parts)
      );
    }

    // default to it did change. we'll likely never reach this codepath
    return true;
  }
}
