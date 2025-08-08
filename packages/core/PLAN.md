# MessageList Refactoring Plan

## Overview

This document outlines the plan for refactoring MessageList usage across the codebase, particularly focusing on the stream directory and establishing clear patterns for message format usage.

## Message Format Hierarchy

### v3 (MastraMessageV3)

- **Purpose**: Internal memory format & storage/persistence
- **Usage**: Primary format for in-memory operations and database storage
- **Structure**: AI SDK v5 compatible with enhanced metadata

### v2 (MastraMessageV2)

- **Purpose**: Backwards compatibility output
- **Usage**:
  - Output format when using AI SDK v4
  - May exist in database from older versions
  - Gets hydrated into v3 when loaded into MessageList
- **Structure**: Intermediate format with parts array

### v1 (MastraMessageV1)

- **Purpose**: Legacy format
- **Usage**:
  - May exist in database
  - Gets converted to v3 when hydrated into MessageList
- **Structure**: content as string or CoreMessageV4['content']

### AI SDK Formats

- **aiV4.core/ui**: For AI SDK v4 model calls
- **aiV5.model/ui**: For AI SDK v5 model calls

## Proposed Changes

### 1. MessageList API Cleanup

#### Remove fromArray() static method

- **Current**: `MessageList.fromArray(messages)`
- **Issue**: Redundant since `.add()` already accepts arrays
- **Action**: Remove the method and update all usage to use `new MessageList().add(messages, source)`
- **Files affected**:
  - `/packages/core/src/agent/message-list/index.ts`
  - `/packages/core/src/llm/model/stream/execute.ts` (lines 79, 173, 747, 1159)
  - Any other files using `MessageList.fromArray()`

#### Rename 'user' to 'input' in MessageSource

- **Current**: `type MessageSource = 'user' | 'response' | 'memory' | 'context'`
- **Issue**: 'user' is confusing as it conflicts with message role
- **Action**: Change to `'input' | 'response' | 'memory' | 'context'`
- **Files affected**:
  - `/packages/core/src/agent/message-list/index.ts`
  - All files passing 'user' as second argument to `.add()`
  - Test files have a ton of these!!

### 2. Stream Directory Fixes

#### Fix reasoningDetailsFromMessages in base/output.ts

**Purpose of the function**:

- Extracts reasoning-related content parts from messages after a step completes
- Transforms reasoning parts into a standardized format for the output stream
- Returns an array of reasoning details with type 'text' for normal reasoning and 'redacted' for redacted reasoning
- Used to populate the `reasoningDetails` field in StepBufferItem, which is then accessible via the output's `reasoningDetails` getter

**Issue**:

- Function expects messages with content parts that have a `type` property
- Currently receives v1 format messages from `chunk.payload.messages.all` where content could be:
  - A string (simple text content)
  - CoreMessageV4['content'] (array of parts)
- This causes "Cannot read properties of undefined (reading 'includes')" error

**Current code** (line 40-58):

```typescript
function reasoningDetailsFromMessages(messages: any[]) {
  return messages
    ?.flatMap((msg: any) => {
      return msg.content;
    })
    ?.filter((message: any) => message.type.includes('reasoning'));
  // ...
}
```

**Input format determination**:

- The function is called with `chunk.payload.messages.all.slice(self.#bufferedByStep.msgCount)`
- These messages come from execute.ts which currently uses `messageList.get.all.v1()` (lines 680, 862)
- Once we switch to v3 internally, the input will be MastraMessageV3[]

**Fix**: Update to handle v3 messages and add proper typing

```typescript
import type { MastraMessageV3 } from '../../../agent/message-list';

function reasoningDetailsFromMessages(messages: MastraMessageV3[]) {
  return messages
    ?.flatMap(msg => {
      // v3 messages have content.parts array
      if (msg.content?.parts && Array.isArray(msg.content.parts)) {
        return msg.content.parts;
      }
      return [];
    })
    ?.filter(part => part?.type?.includes?.('reasoning'))
    ?.map(part => {
      let type;
      if (part.type === 'reasoning') {
        type = 'text';
      } else if (part.type === 'redacted-reasoning') {
        type = 'redacted';
      }
      return {
        ...part,
        type,
      };
    });
}
```

#### Standardize message format usage in execute.ts

- **Current inconsistencies**:
  - Line 194: `messageList.get.all.aiV4.core()` ✓ (correct for v4 model) however it should not be cast as any, that means there is something wrong. It seems we need to make MessageList support outputting as the LanguageModelV1Prompt type from ai v4!
  - Line 227: `messageList.get.all.aiV5.model()` ✓ (correct for v5 model). Same note as above for this one! However additional thing I noticed is `executeV5` takes `inputMessages` as `LanguageModelV1Prompt` which is incorrect. It should take `LanguageModelV2Prompt`
  - Line 680: `messageList.get.all.v1()` ❌ (should use v3 internally)
  - Line 791: `messageList.get.all.v2()` (debug log - ok) actually no, it should use v3 as well
  - Line 862: `messageList.get.all.v1()` ❌ (should use v3 internally)
  - Line 1161: `messageList.get.all.aiV4.core()` ✓ (correct for model call). but also, same as above we actually need to be able to output as LanguageModelV1/2Prompt type from MessageList so that we don't need to do `as any` here

- **Type issues to fix**:
  - `ExecutionProps` in types.ts incorrectly defines `inputMessages: LanguageModelV1Prompt` for both v4 and v5
  - Need to update ExecutionProps to be generic or have separate types
  - MessageList needs methods that return properly typed prompts:
    - `aiV4.prompt(): LanguageModelV1Prompt` for AI SDK v4
    - `aiV5.prompt(): LanguageModelV2Prompt` for AI SDK v5
  - Currently `aiV4.core()` returns `CoreMessageV4[]` which is not assignable to `LanguageModelV1Prompt`
  - Currently `aiV5.model()` returns `CoreMessageV5[]` which is not assignable to `LanguageModelV2Prompt`

- **Proposed changes**:
  - Use v3 for internal processing (lines 680, 791, 862)
  - Add new methods to MessageList that return proper prompt types
  - Fix ExecutionProps to handle both v4 and v5 input types correctly
  - Remove all `as any` casts once types are fixed

#### Add new MessageList prompt methods

**Important distinction**:

- `all.prompt()` (existing) - For use with AI SDK's `generateText`/`streamText` functions
- `all.aiV4.prompt()` (new) - For internal use when recreating generateText/streamText logic
- `all.aiV5.prompt()` (new) - For internal use when recreating generateText/streamText logic

**New methods needed**:

```typescript
// In MessageList class
private all = {
  // ... existing methods ...

  prompt: () => {
    // EXISTING METHOD - for AI SDK generateText/streamText
    // Returns messages formatted for direct use with AI SDK functions
  },

  aiV4: {
    ui: (): UIMessageV4[] => /* existing */,
    core: (): CoreMessageV4[] => /* existing */,
    prompt: (): LanguageModelV1Prompt => {
      // NEW METHOD - for internal stream execution
      // Used when we're manually calling model.doStream() instead of using AI SDK's streamText
      // This should return the exact LanguageModelV1Prompt type expected by the model
      const coreMessages = this.all.aiV4.core();
      // Format as LanguageModelV1Prompt (the union type that includes system messages)
      return /* properly formatted prompt for direct model.doStream() calls */;
    }
  },

  aiV5: {
    ui: (): UIMessageV5[] => /* existing */,
    model: (): CoreMessageV5[] => /* existing */,
    prompt: (): LanguageModelV2Prompt => {
      // NEW METHOD - for internal stream execution
      // Used when we're manually calling model.doStream() instead of using AI SDK's streamText
      // This should return the exact LanguageModelV2Prompt type expected by the model
      const modelMessages = this.all.aiV5.model();
      // Format as LanguageModelV2Prompt (the union type that includes system messages)
      return /* properly formatted prompt for direct model.doStream() calls */;
    }
  }
}
```

**Usage contexts**:

- `all.prompt()` → Used in high-level agent/workflow code that calls AI SDK's `generateText`/`streamText`
- `all.aiV4.prompt()` → Used in stream/execute.ts when directly calling `model.doStream()` for v4 models
- `all.aiV5.prompt()` → Used in stream/execute.ts when directly calling `model.doStream()` for v5 models

### 3. Usage Patterns

#### When to use each format:

| Format        | Use When                                                       |
| ------------- | -------------------------------------------------------------- |
| v3            | Internal processing, memory storage, new database writes       |
| v2            | Outputting for backwards compatibility, AI SDK v4 interactions |
| v1            | Only when reading legacy data from database                    |
| aiV4.core/ui  | Calling AI SDK v4 models                                       |
| aiV5.model/ui | Calling AI SDK v5 models                                       |

#### Conversion flow:

```
Database (v1/v2/v3) → Hydrate → v3 (in memory) → Convert as needed → Model/Output
```

### 4. Type Safety Improvements

#### Add type guards

```typescript
function isV3Message(msg: any): msg is MastraMessageV3 {
  return msg?.content?.format === 3 || (msg?.content?.parts && msg?.content?.metadata !== undefined);
}

function isV2Message(msg: any): msg is MastraMessageV2 {
  return msg?.content?.format === 2;
}

function isV1Message(msg: any): msg is MastraMessageV1 {
  return msg && !msg?.content?.format && !msg?.content?.parts;
}
```

## Implementation Order

1. **Phase 1: Plan & Prepare**
   - [x] Create this PLAN.md
   - [ ] Review and refine plan with team
   - [ ] Identify all affected files

2. **Phase 2: Core Changes**
   - [ ] Fix `reasoningDetailsFromMessages` to handle all formats
   - [ ] Remove `MessageList.fromArray()`
   - [ ] Change 'user' to 'input' in MessageSource

3. **Phase 3: Stream Directory Updates**
   - [ ] Update execute.ts to use v3 for internal processing
   - [ ] Ensure consistent format usage
   - [ ] Update any affected transforms

4. **Phase 4: Testing**
   - [ ] Run stream execute tests
   - [ ] Fix any failing tests
   - [ ] Update snapshots if needed

5. **Phase 5: Cleanup**
   - [ ] Add type guards where needed
   - [ ] Update documentation
   - [ ] Final test run

## Testing Strategy

### Tests to run after each phase:

```bash
# Stream tests
cd packages/core
pnpm test stream/execute.test.ts --reporter=dot --bail 1

# Message list tests
pnpm test message-list --reporter=dot --bail 1

# Full core test suite (final validation)
pnpm test --reporter=dot
```

## Files to Modify

### High Priority (Core fixes)

1. `/packages/core/src/llm/model/stream/base/output.ts` - Fix reasoningDetailsFromMessages
2. `/packages/core/src/agent/message-list/index.ts` - Remove fromArray, change 'user' to 'input'
3. `/packages/core/src/llm/model/stream/execute.ts` - Update message format usage

### Medium Priority (Usage updates)

- All files using `MessageList.fromArray()`
- All files passing 'user' as MessageSource
- Test files that may need updates

### Low Priority (Documentation)

- Update any documentation referring to MessageList.fromArray
- Update examples using old patterns

## Open Questions

1. Should we add a migration utility for v1/v2 to v3 conversion in the database?
2. Do we need to maintain v1 format support for reading, or can we migrate all data?
3. Should we add runtime warnings when using deprecated patterns?
4. How do we handle the transition period for external consumers?

## Notes

- v3 format is the future-facing format aligned with AI SDK v5
- v2 remains important for backwards compatibility, especially with AI SDK v4
- The goal is to have clear, predictable format usage throughout the codebase
- Internal processing should always use v3 for consistency

## Added TODOs for the end:

In message list file we have imports like this:

```ts
import { randomUUID } from 'crypto';
import type { LanguageModelV2Prompt } from '@ai-sdk/provider-v5';
import type { CoreMessage as CoreMessageV4, IdGenerator, UIMessage as UIMessageV4, LanguageModelV1Prompt } from 'ai';
import * as AIV4 from 'ai';
import type {
  UIMessage as UIMessageV5,
  CoreMessage as CoreMessageV5,
  UIMessagePart,
  ModelMessage as ModelMessageV5,
} from 'ai-v5';
import * as AIV5 from 'ai-v5';
```

that's messy. Lets standardize on using the \* imports, so instead of using UIMessageV5 for ex, lets do AIV5.UIMessage (and so on)
