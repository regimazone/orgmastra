# AI SDK v5 Transforms for Mastra - Implementation Summary

## Overview

I've successfully researched and implemented AI SDK v5 transforms for Mastra, providing compatibility with the latest AI SDK v5 beta features. This implementation follows the new v5 architecture while maintaining compatibility with existing Mastra streaming infrastructure.

## Key Research Findings

### AI SDK v5 Major Changes
1. **LanguageModelV2**: New protocol treating all outputs as content parts
2. **UIMessage vs ModelMessage**: Separation of UI representation and model communication
3. **Server-Sent Events (SSE)**: Standardized streaming protocol replacing custom formats
4. **Enhanced Type Safety**: Better TypeScript support with specific tool naming
5. **Message Metadata**: Structured, type-safe metadata support
6. **Content-First Design**: Everything represented as ordered content parts

### Migration Differences from v4
- **Message Format**: From simple `{role, content}` to rich `UIMessage` with parts array
- **Streaming Protocol**: From custom data stream to SSE standard
- **Tool Calls**: From generic `tool-invocation` to type-safe `tool-${toolName}`
- **Metadata**: From limited to full type-safe metadata schemas

## Implementation Details

### Files Created/Modified

1. **`packages/core/src/stream/aisdk/v5.ts`** - Main v5 transforms implementation
2. **`packages/core/src/stream/compat.ts`** - Added `getErrorMessageV5` function
3. **`packages/core/src/stream/base/index.ts`** - Added v5 support to base classes
4. **`packages/core/src/stream/aisdk/v5.test.ts`** - Comprehensive test suite
5. **`examples/ai-sdk-v5/app/api/chat/route.ts`** - Updated to use v5 transforms
6. **`examples/ai-sdk-v5-transforms-demo/README.md`** - Documentation and examples

### Core Components

#### 1. AISDKV5InputStream
```typescript
export class AISDKV5InputStream extends BaseModelStream {
  async transform({ runId, stream, controller }) {
    // Converts AI SDK v5 streams to Mastra format
  }
}
```

#### 2. AISDKV5OutputStream  
```typescript
export class AISDKV5OutputStream {
  toUIMessageStreamResponse() // SSE streaming with UIMessage format
  toUIMessageStream()         // Core streaming logic
  toDataStream()             // Legacy compatibility
  consumeStream()            // Stream consumption with UIMessage assembly
}
```

#### 3. convertFullStreamChunkToAISDKv5
Core conversion function supporting:
- Text deltas with content parts
- Reasoning streaming (when enabled)
- Source streaming (when enabled)  
- Tool calls with type-safe naming
- Metadata injection
- Error handling
- Server-Sent Events formatting

### Key Features Implemented

#### UIMessage Structure
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

#### Server-Sent Events Support
```typescript
// SSE format for streaming
data: {"type": "text-delta", "delta": {"content": "Hello"}}
data: {"type": "reasoning-delta", "delta": {"reasoning": "Thinking..."}}
data: {"type": "source", "source": {...}}
data: [DONE]
```

#### Type-Safe Tool Calls
```typescript
// v5 uses specific tool naming for better type safety
message.parts?.forEach(part => {
  switch (part.type) {
    case 'tool-weather':
      // Handle weather tool
      break;
    case 'tool-search':
      // Handle search tool
      break;
  }
});
```

#### Metadata Support
```typescript
return stream.aisdk.v5.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  sendMetadata: true,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        duration: Date.now() - startTime,
        model: 'my-model',
        totalTokens: part.usage?.totalTokens,
      };
    }
  },
});
```

### Usage Example

#### Server-side (Mastra Agent)
```typescript
const stream = await myAgent.stream(messages, {
  threadId: "thread-1",
  resourceId: "resource-1"
});

// Use v5 transforms
return stream.aisdk.v5.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  sendMetadata: true,
  messageMetadata: ({ part }) => ({
    timestamp: new Date().toISOString(),
    // Add custom metadata
  }),
});
```

#### Client-side (AI SDK v5)
```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
  }),
});

// Messages automatically include v5 UIMessage format
messages.forEach(message => {
  message.parts?.forEach(part => {
    switch (part.type) {
      case 'text':
        console.log('Text:', part.text);
        break;
      case 'tool-weather':
        console.log('Weather tool:', part.args);
        break;
      case 'reasoning':
        console.log('Reasoning:', part.reasoning);
        break;
    }
  });
});
```

### Integration with Mastra

The v5 transforms integrate seamlessly with Mastra's existing architecture:

1. **Stream Pipeline**: Mastra chunks → v5 converter → UIMessage/SSE format
2. **Base Class Integration**: Added to `MastraModelOutput.aisdk.v5`
3. **Backward Compatibility**: v4 transforms continue to work unchanged
4. **Tool Support**: Maintains Mastra's tool calling with v5 type safety
5. **Error Handling**: Consistent error formatting across versions

### Testing

Comprehensive test suite covering:
- Chunk conversion for all stream types
- SSE formatting validation
- Metadata injection
- Tool call transformations
- Error handling
- Stream response creation
- Backwards compatibility

### Benefits

1. **Future-Proof**: Support for latest AI SDK v5 features
2. **Type Safety**: Enhanced TypeScript support with v5
3. **Standards Compliance**: Uses SSE standard for better tooling
4. **Developer Experience**: Better debugging with SSE inspector tools
5. **Flexibility**: Optional features (reasoning, sources, metadata)
6. **Performance**: Efficient streaming with minimal overhead

## Next Steps

1. **Production Testing**: Test with real workloads
2. **Documentation**: Expand examples and use cases  
3. **Migration Guide**: Create detailed v4 → v5 migration instructions
4. **Performance Optimization**: Profile and optimize stream processing
5. **Additional Features**: Implement remaining v5 features as needed

## Conclusion

The AI SDK v5 transforms provide a complete implementation of the new v5 architecture while maintaining full compatibility with Mastra's existing systems. This positions Mastra to leverage the latest AI SDK capabilities including enhanced type safety, standardized streaming, and rich metadata support.

The implementation follows best practices from the AI SDK documentation and provides a solid foundation for future enhancements as AI SDK v5 moves from beta to stable release.