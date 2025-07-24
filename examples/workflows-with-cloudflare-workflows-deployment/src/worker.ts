import { createMastraCloudflareWorkflow, createMastraFetchHandler } from '@mastra/cloudflare-workflows/workers';
import { mastra } from './mastra';

// Create the Cloudflare Workflow class using the helper
export const MastraCloudflareWorkflow = createMastraCloudflareWorkflow(mastra);

// Environment for the fetch handler
type FetchEnv = {
  MASTRA_WORKFLOW: any;
};

export default {
  async fetch(req: Request, env: FetchEnv): Promise<Response> {
    // Use the helper function to handle HTTP requests
    const handler = createMastraFetchHandler(env.MASTRA_WORKFLOW);
    return handler(req);
  },
};
