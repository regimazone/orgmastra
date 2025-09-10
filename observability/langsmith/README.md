# @mastra/langsmith

LangSmith AI Observability exporter for Mastra applications.

## Installation

```bash
npm install @mastra/langsmith
```

## Usage

```typescript
import { LangSmithExporter } from '@mastra/langsmith';

// Use with Mastra
const mastra = new Mastra({
  ...,
  observability: {
    configs: {
      langsmith: {
        serviceName: 'service',
        exporters: [
          new LangSmithExporter({
            apiKey: process.env.LANGSMITH_API_KEY,
            projectName: "mastra-tracing", // optional - defaults to 'mastra-tracing'
            endpoint: process.env.LANGSMITH_ENDPOINT, // optional
          }),
        ],
      },
    },
  },
});
```

## Features

### AI Tracing

- **RunTree-based integration**: Uses LangSmith's native RunTree API for hierarchical span relationships
- **Automatic span mapping**: Maps Mastra span types to LangSmith run types (llm, tool, chain)
- **LLM generation support**: `LLM_GENERATION` spans become LLM runs with token usage and model parameters
- **Type-specific metadata**: Extracts relevant metadata for each span type (agents, tools, workflows)
- **Error tracking**: Automatic error status and message tracking
- **Hierarchical traces**: Maintains parent-child relationships using RunTree's createChild method
- **Event span support**: Zero-duration spans for event-type traces
- **Project organization**: Configurable project names for organizing traces in LangSmith

## License

Apache 2.0
