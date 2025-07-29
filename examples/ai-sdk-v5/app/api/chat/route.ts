import { mastra } from "@/src/mastra";

const myAgent = mastra.getAgent("weatherAgent");
export async function POST(req: Request) {
  const { messages } = await req.json();
  const startTime = Date.now();

  const stream = await myAgent.stream(messages, {
    threadId: "2",
    resourceId: "1",
  });

  // Use the new AI SDK v5 transforms with UIMessage streaming
  return stream.aisdk.v5.toUIMessageStreamResponse({
    sendReasoning: true,
    sendSources: true,
    sendMetadata: true,
    messageMetadata: ({ part }) => {
      // Add metadata based on the stream part
      if (part.type === 'finish') {
        return {
          duration: Date.now() - startTime,
          model: 'weather-agent',
          totalTokens: part.usage?.totalTokens,
        };
      }
      
      if (part.type === 'step-start') {
        return {
          stepStarted: true,
          timestamp: new Date().toISOString(),
        };
      }

      return undefined;
    },
  });
}
