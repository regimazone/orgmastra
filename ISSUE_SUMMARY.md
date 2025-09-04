# Issue #6827: Agent Makes Repetitive Tool Calls

## Problem Description

The agent intermittently makes repetitive/identical tool calls, continuing until the maxSteps limit (default 5) is reached. This is a critical bug for mutative operations as it causes the same action to execute multiple times.

## Key Characteristics

- **Frequency**: Intermittent (1 in 20-30 attempts)
- **Affected Model**: Primarily Gemini 2.5 Pro (Gemini Flash and other models work fine)
- **Behavior**: Same tool called multiple times with identical args but different tool call IDs
- **Stop Condition**: Only stops when maxSteps is reached
- **Versions Affected**: Persists in latest versions (@mastra/core@0.15.3-alpha.3, @mastra/memory@0.14.3-alpha.0)

## Example of the Issue

```json
{
  "parts": [
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "toolCallId": "nWUROp6QDCmwDBcI",
        "toolName": "notify-care-team",
        "args": {},
        "result": { "success": true }
      }
    },
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "toolCallId": "IaKFgAJCCICn6dwo",
        "toolName": "notify-care-team",
        "args": {},
        "result": { "success": true }
      }
    },
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "toolCallId": "EcJCRtyocK68LY8B",
        "toolName": "notify-care-team",
        "args": {},
        "result": { "success": true }
      }
    },
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "toolCallId": "LInJA3X75r3t4aY8",
        "toolName": "notify-care-team",
        "args": {},
        "result": { "success": true }
      }
    },
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "toolCallId": "vARIyWYuIN5CFiZL",
        "toolName": "notify-care-team",
        "args": {},
        "result": { "success": true }
      }
    }
  ]
}
```

## Related Issues

1. **Issue #5782**: Similar issue with duplicate responses and continuous loops - supposedly fixed in PR #6062 (v0.11.1) but the fix doesn't address this specific case
2. **AI SDK Issue #7261**: Similar behavior reported with the Vercel AI SDK where LLM makes same tool call multiple times

## User Reports

- **@clairecfu**: Original reporter, confirmed issue persists after updating to latest versions
- **@anieve01**: Confirmed same issue, specifically with Gemini 2.5 Pro, onStepFinish called 5 times with duplicated content
- **@abhiaiyer91**: Suggested checking tool_choice setting and trying generateVNext/streamVNext

## Investigation Notes

### Code Analysis

1. **Agent Implementation** (`packages/core/src/agent/index.ts`):
   - Agent has maxSteps configuration (default 5)
   - Uses `onStepFinish` callback to handle each tool execution
   - Tool execution managed through loop/model.loop.ts

2. **Message List** (`packages/core/src/agent/message-list/`):
   - Handles conversion between different message formats (V1, V2, V3)
   - Tool invocations stored with unique IDs but same tool name/args
   - Has logic to filter and merge tool invocations

3. **Loop Implementation** (`packages/core/src/llm/model/model.loop.ts`):
   - Uses `stepCountIs` from ai-v5 to control max steps
   - Default stopWhen condition is `stepCountIs(5)`

### Potential Root Causes

1. **LLM Response Issue**: Gemini 2.5 Pro might be returning multiple tool calls in a single response
2. **Message State Management**: Tool call results might not be properly tracked/merged in message history
3. **Loop Control**: The step counter or stop condition might not be working correctly for Gemini 2.5 Pro
4. **Tool Choice Configuration**: Default 'auto' tool choice might behave differently with Gemini

### What We Need to Test

1. Reproduce with Gemini 2.5 Pro specifically
2. Check if the LLM is returning multiple tool calls in one response or if it's a loop issue
3. Verify message history is correctly updated after each tool call
4. Test with different tool_choice settings ('auto' vs 'required' vs 'none')
5. Check if onStepFinish is being called correctly and if savePerStep affects the behavior

## Next Steps

1. Write a test that reproduces the issue with Gemini 2.5 Pro
2. Debug to understand if it's happening at the LLM level or in our message handling
3. Implement fix based on root cause analysis
