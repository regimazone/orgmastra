# Mastra Cloudflare Workflows Example

This example shows how to deploy a Mastra project to Cloudflare Workflows for durable execution.

## What This Example Demonstrates

- ✅ **Real Mastra Integration**: Uses actual `DefaultExecutionEngine` and Mastra workflows
- ✅ **Cloudflare Workflows Durability**: Automatic retries and state persistence
- ✅ **Multi-step Workflows**: Process → Validate → Finalize pattern
- ✅ **HTTP Triggers**: Start workflows via HTTP requests
- ✅ **Status Monitoring**: Check workflow progress and results
- ✅ **Simple API**: Just 3 lines of code to deploy Mastra to Cloudflare!

## Project Structure

```
src/
├── workflows/
│   └── simple-workflow.ts    # Mastra workflow definition
└── index.ts                  # Cloudflare Workers + Workflows integration
```

## Setup

1. **Install dependencies:**

   ```bash
   pnpm install --ignore-workspace
   ```

2. **Login to Cloudflare:**

   ```bash
   npx wrangler login
   ```

3. **Generate types:**
   ```bash
   npx wrangler types
   ```

## Deploy

```bash
pnpm deploy
```

## Test the Workflow

### Start a workflow:

```bash
# Simple test
curl https://your-worker.workers.dev/

# With custom input
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"input": {"message": "Hello Mastra!", "count": 5}}'

# Via query parameters
curl "https://your-worker.workers.dev/?workflowId=simple-workflow&input={\"message\":\"Test\",\"count\":3}"
```

### Resume a suspended workflow:

```bash
# Resume via POST with resume data
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"message": "Resuming workflow"},
    "resume": {
      "steps": ["step1", "step2"],
      "stepResults": {"step1": {"result": "data"}},
      "resumePayload": {"userInput": "continue"},
      "resumePath": [2]
    }
  }'

# Resume via query parameters (URL encoded)
curl "https://your-worker.workers.dev/?workflowId=my-workflow&resume={\"steps\":[\"step1\"],\"resumePayload\":{\"continue\":true}}"
```

### Check workflow status:

```bash
curl "https://your-worker.workers.dev/?instanceId=YOUR_INSTANCE_ID"
```

## The Workflow

The example workflow (`simple-workflow`) has three steps:

1. **Process Data**: Takes input message and count, processes them
2. **Validate**: Validates the processed data
3. **Finalize**: Creates final result with completion timestamp

## How It Works

1. **HTTP Request** → Cloudflare Workers fetch handler
2. **Create Workflow Instance** → Triggers `MastraCloudflareWorkflow`
3. **Execute Mastra Workflow** → Runs `DefaultExecutionEngine` inside CF Workflow
4. **Durable Execution** → CF Workflows handles retries and state persistence
5. **Return Results** → Workflow output available via status API

## The Code (It's Really This Simple!)

```typescript
import { createMastraCloudflareWorkflow, createMastraFetchHandler } from '@mastra/cloudflare-workflows';
import { Mastra } from '@mastra/core';
import { myWorkflow } from './workflows/my-workflow.js';

// 1. Create Mastra instance with your workflows
const mastra = new Mastra({
  workflows: { myWorkflow },
});

// 2. Create the Cloudflare Workflow class
export const MastraCloudflareWorkflow = createMastraCloudflareWorkflow(mastra);

// 3. Create the HTTP handler
export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const handler = createMastraFetchHandler(env.MASTRA_WORKFLOW);
    return handler(req);
  },
};
```

That's it! Your Mastra workflows now run on Cloudflare with full durability.

## Suspend/Resume Support

This integration fully supports Mastra's suspend/resume functionality:

### In Your Workflow Steps:

```typescript
const stepWithSuspend = createStep({
  id: 'waitForApproval',
  suspendSchema: z.object({ requestId: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ suspend, resumeData }) => {
    if (!resumeData?.approved) {
      await suspend({ requestId: 'req-123' });
      return { status: 'pending' };
    }
    return { status: 'approved', approved: resumeData.approved };
  },
});
```

### Resuming Workflows:

When a workflow suspends, you can resume it by calling the API with resume data:

```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"originalInput": "data"},
    "resume": {
      "steps": ["waitForApproval"],
      "stepResults": {"previousStep": {"result": "data"}},
      "resumePayload": {"approved": true},
      "resumePath": [1]
    }
  }'
```

The Cloudflare Workflows integration handles all the complexity of passing resume data to Mastra's execution engine.

## Key Benefits

- **Durability**: If any step fails, CF Workflows automatically retries
- **Suspend/Resume**: Full support for Mastra's suspend/resume functionality
- **Observability**: View workflow progress in Cloudflare dashboard
- **Scalability**: Runs on Cloudflare's global edge network
- **Cost Effective**: Pay only for execution time
- **No Infrastructure**: Serverless deployment

## Customization

### Add Your Own Workflows

1. Create workflow in `src/workflows/`
2. Import and add to Mastra instance in `src/index.ts`
3. Deploy and test

### Add Bindings

Add Cloudflare bindings (KV, D1, R2, etc.) to `wrangler.toml` and use them in your workflows:

```toml
[[kv_namespaces]]
binding = "MY_KV"
id = "your-kv-id"
```

```typescript
// In your workflow steps
const data = await this.env.MY_KV.get('key');
```

## Production Considerations

- Add proper error handling and logging
- Implement authentication for workflow triggers
- Use environment variables for configuration
- Set up monitoring and alerting
- Consider workflow timeouts and resource limits

This example provides a foundation for deploying production Mastra workflows to Cloudflare Workflows!
