import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';

import { resumeWeatherTool, startWeatherTool, weatherTool } from '../tools';

export const weatherAgent = new Agent({
  name: 'Weather Agent',
  instructions: `You are a helpful weather assistant that provides accurate weather information.

Your primary function is to help users get weather details for specific locations. When responding:
- Always ask for a location if none is provided
- If the location name isn’t in English, please translate it
- If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
- Include relevant details like humidity, wind conditions, and precipitation
- Keep responses concise but informative

Use the weatherTool to fetch current weather data.`,
  model: openai('gpt-4o'),
  tools: { weatherTool },
});

export const weatherAgentWithWorkflow = new Agent({
  name: 'Weather Agent with Workflow',
  instructions: `You are a helpful weather assistant that provides accurate weather information.

Your primary function is to help users get weather details for specific locations. When responding:
- Always ask for a location if none is provided
- If the location name isn’t in English, please translate it
- If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
- Include relevant details like humidity, wind conditions, and precipitation
- Keep responses concise but informative

Use the startWeatherTool to start the weather workflow. This will start and then suspend the workflow and return a runId.
Use the resumeWeatherTool to resume the weather workflow. This takes the runId returned from the startWeatherTool and the city entered by the user. It will resume the workflow and return the result.
The result will be the weather forecast for the city.`,
  model: openai('gpt-4o'),
  tools: { startWeatherTool, resumeWeatherTool },
});

export const weatherReporterAgent = new Agent({
  name: 'weatherExplainerAgent',
  model: openai('gpt-4o'),
  instructions: `
  You are a weather explainer. You have access to input that will help you get weather-specific activities for any city. 
  The tool uses agents to plan the activities, you just need to provide the city. Explain the weather report like a weather reporter.
  `,
});
