# AI SDK v5 Transforms Demo

This example demonstrates how to use Mastra's new AI SDK v5 transforms, which provide compatibility with the latest AI SDK v5 features including:

- **UIMessage format**: New message structure with parts array and metadata support
- **Server-Sent Events (SSE)**: Standard streaming protocol for better browser compatibility
- **Type-safe metadata**: Structured message metadata with TypeScript support
- **Enhanced streaming**: Support for reasoning, sources, and data parts
- **Tool calls**: Type-safe tool invocations with `tool-${toolName}` naming

## Key Features

### UIMessage Structure
```typescript
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: Array<UIMessagePart>;
  metadata?: any;
  createdAt?: Date;
}
```

### Streaming with Server-Sent Events
The v5 transforms use Server-Sent Events (SSE) for streaming, providing better browser compatibility and easier debugging:

```typescript
// Server response format
data: {"type": "text-delta", "delta": {"content": "Hello"}}

data: {"type": "reasoning-delta", "delta": {"reasoning": "I need to respond"}}

data: {"type": "source", "source": {"type": "url", "url": "https://example.com"}}

data: [DONE]
```

### Usage with Mastra

```typescript
import { mastra } from './mastra';

const agent = mastra.getAgent('myAgent');

const stream = await agent.stream(messages, {
  threadId: "thread-1",
  resourceId: "resource-1"
});

// Use v5 transforms for UIMessage streaming
return stream.aisdk.v5.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  sendMetadata: true,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        duration: Date.now() - startTime,
        totalTokens: part.usage?.totalTokens
      };
    }
  }
});
```

### Client-side Integration

Works seamlessly with AI SDK v5's new `useChat` hook:

```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
  }),
});

// Messages automatically include parts array with type-safe metadata
messages.forEach(message => {
  message.parts?.forEach(part => {
    switch (part.type) {
      case 'text':
        console.log('Text:', part.text);
        break;
      case 'tool-weather':
        console.log('Weather tool called:', part.args);
        break;
      case 'reasoning':
        console.log('Reasoning:', part.reasoning);
        break;
      case 'source':
        console.log('Sources:', part.sources);
        break;
    }
  });
});
```

## Differences from v4

### Message Format
- **v4**: Simple `{ role, content }` structure
- **v5**: Rich `UIMessage` with parts array and metadata

### Streaming Protocol
- **v4**: Custom data stream format
- **v5**: Server-Sent Events (SSE) standard

### Tool Calls
- **v4**: Generic `tool-invocation` type
- **v5**: Type-safe `tool-${toolName}` naming

### Metadata
- **v4**: Limited metadata support
- **v5**: Full type-safe metadata with structured schemas

## Running the Example

```bash
cd examples/ai-sdk-v5-transforms-demo
npm install
npm run dev
```

Navigate to `http://localhost:3000` to see the AI SDK v5 transforms in action.