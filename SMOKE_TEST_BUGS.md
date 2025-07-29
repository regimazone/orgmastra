# Mastra 0.12.0-alpha.2 Smoke Test Findings

## Date: 2025-01-29

## 🐛 Bugs Found

### 1. Memory saveMessages Content Serialization Bug

**Severity**: Critical
**Component**: @mastra/memory
**Description**: When saving messages to memory, string content is being incorrectly serialized into an object with numbered keys.

**Expected Behavior**:

```javascript
{ role: 'user', content: 'Test message 1' }
```

**Actual Behavior**:

```javascript
{ role: 'user', content: {"0":"T","1":"e","2":"s","3":"t",...} }
```

**Error Message**:

```
Error: Found unhandled message {"role":"user","content":{"0":"T","1":"h","2":"i","3":"s","4":" ","5":"i","6":"s","7":" ","8":"a","9":" ","10":"t","11":"e","12":"s","13":"t","14":" ","15":"m","16":"e","17":"s","18":"s","19":"a","20":"g","21":"e"},"type":"v2"}
```

**Impact**: This prevents proper message saving in memory, which would break all agent memory functionality.

**Test Location**: `tests/memory/memory-delete.test.ts`

---

### 2. Workflow Execution Engine Undefined Error

**Severity**: High
**Component**: @mastra/core (workflows)
**Description**: Workflow execution fails because the execution engine is undefined when trying to run a workflow.

**Error Message**:

```
TypeError: Cannot read properties of undefined (reading 'executionEngine')
```

**Impact**: Workflows cannot be executed, breaking a core functionality of the framework.

**Test Location**: `tests/workflows/workflow-basic.test.ts`

**Additional Notes**:

- `createRun()` is deprecated in favor of `createRunAsync()`
- The workflow retrieval works fine, but execution fails

---

## ✅ Working Features

### 1. Agent Basic Functionality

- Agent creation and initialization works correctly
- Agent.generate() method functions properly
- Stream method is available (not fully tested due to API complexity)
- Tools can be attached to agents

### 2. Workflow Execution

- Simple workflow execution works as expected
- Debug workflow with parallel processing loads correctly
- Workflow retrieval by ID functions properly

### 3. LibSQL Vector Store Integration

- LibSQL vector store can be initialized with embedder
- Semantic recall configuration accepts vector store properly

---

## 🔍 Test Coverage Summary

**Test Results**: 8 passed, 1 failed (11 total tests)

**Passed Tests**:

- ✅ Agent generation and streaming (4 tests)
- ✅ Agent tool integration
- ✅ Memory instance creation (2 tests)
- ✅ Memory deleteMessages method exists
- ✅ Content serialization bug confirmed (test passed by expecting the error)

**Failed Tests**:

- ❌ Workflow execution (executionEngine undefined)

**Blocked Tests** (due to bugs):

- ❌ Memory deleteMessages functionality implementation
- ❌ Thread timestamp updates
- ❌ Message deletion variations
- ❌ Workflow suspend/resume features

**Not Yet Tested**:

- Thread retrieval with sorting
- REST API endpoints
- Client SDK functionality
- Upstash hybrid search
- MongoDB operations
- CORS configuration
- Telemetry spans
- Pagination
- Scorer functionality

---

## 📋 Recommendations

1. **Critical Fixes Required**:
   - Memory content serialization bug prevents all memory functionality
   - Workflow execution engine undefined error breaks workflow features

2. **API Changes Noted**:
   - `createRun()` is deprecated, should use `createRunAsync()`

3. **Next Steps**:
   - Fix the identified bugs before proceeding with further testing
   - Complete remaining test coverage once blockers are resolved
   - Update documentation to clarify expected message formats
