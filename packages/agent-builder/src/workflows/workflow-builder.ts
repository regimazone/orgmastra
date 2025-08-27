import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { createTool } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { stepCountIs } from 'ai';
import { z } from 'zod';
import { AgentBuilder } from '../agent';
import { AgentBuilderDefaults } from '../defaults';
import {
  WorkflowBuilderInputSchema,
  WorkflowBuilderResultSchema,
  WorkflowDiscoveryResultSchema,
  ProjectDiscoveryResultSchema,
  WorkflowResearchResultSchema,
  TaskExecutionResultSchema,
} from '../types';
import type { DiscoveredWorkflowSchema } from '../types';
import { resolveModel } from '../utils';
import { planningAndApprovalWorkflow } from './task-planning';

const research = `
## 🔍 **COMPREHENSIVE MASTRA WORKFLOW RESEARCH SUMMARY**

Based on extensive research of Mastra documentation and examples, here's essential information for building effective Mastra workflows:

### **📋 WORKFLOW FUNDAMENTALS**

**Core Components:**
- **\`createWorkflow()\`**: Main factory function that creates workflow instances
- **\`createStep()\`**: Creates individual workflow steps with typed inputs/outputs  
- **\`.commit()\`**: Finalizes workflow definition (REQUIRED to make workflows executable)
- **Zod schemas**: Used for strict input/output typing and validation

**Basic Structure:**
\`\`\`typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const workflow = createWorkflow({
  id: "unique-workflow-id",           // Required: kebab-case recommended
  description: "What this workflow does", // Optional but recommended
  inputSchema: z.object({...}),       // Required: Defines workflow inputs
  outputSchema: z.object({...})       // Required: Defines final outputs
})
  .then(step1)                       // Chain steps sequentially
  .then(step2)
  .commit();                         // CRITICAL: Makes workflow executable
\`\`\`

### **🔧 STEP CREATION PATTERNS**

**Standard Step Definition:**
\`\`\`typescript
const myStep = createStep({
  id: "step-id",                     // Required: unique identifier
  description: "Step description",    // Recommended for clarity
  inputSchema: z.object({...}),       // Required: input validation
  outputSchema: z.object({...}),      // Required: output validation
  execute: async ({ inputData, mastra, getStepResult, getInitData }) => {
    // Step logic here
    return { /* matches outputSchema */ };
  }
});
\`\`\`

**Execute Function Parameters:**
- \`inputData\`: Validated input matching inputSchema
- \`mastra\`: Access to Mastra instance (agents, tools, other workflows)
- \`getStepResult(stepInstance)\`: Get results from previous steps
- \`getInitData()\`: Access original workflow input data
- \`runtimeContext\`: Runtime dependency injection context
- \`runCount\`: Number of times this step has run (useful for retries)

### **🔄 CONTROL FLOW METHODS**

**Sequential Execution:**
- \`.then(step)\`: Execute steps one after another
- Data flows automatically if schemas match

**Parallel Execution:**
- \`.parallel([step1, step2])\`: Run steps simultaneously
- All parallel steps complete before continuing

**Conditional Logic:**
- \`.branch([[condition, step], [condition, step]])\`: Execute different steps based on conditions
- Conditions evaluated sequentially, matching steps run in parallel

**Loops:**
- \`.dountil(step, condition)\`: Repeat until condition becomes true
- \`.dowhile(step, condition)\`: Repeat while condition is true  
- \`.foreach(step, {concurrency: N})\`: Execute step for each array item

**Data Transformation:**
- \`.map(({ inputData, getStepResult, getInitData }) => transformedData)\`: Transform data between steps

### **⏸️ SUSPEND & RESUME CAPABILITIES**

**For Human-in-the-Loop Workflows:**
\`\`\`typescript
const userInputStep = createStep({
  id: "user-input",
  suspendSchema: z.object({}),        // Schema for suspension payload
  resumeSchema: z.object({            // Schema for resume data
    userResponse: z.string()
  }),
  execute: async ({ resumeData, suspend }) => {
    if (!resumeData?.userResponse) {
      await suspend({});  // Pause workflow
      return { response: "" };
    }
    return { response: resumeData.userResponse };
  }
});
\`\`\`

**Resume Workflow:**
\`\`\`typescript
const result = await run.start({ inputData: {...} });
if (result.status === "suspended") {
  await run.resume({
    step: result.suspended[0],        // Or specific step ID
    resumeData: { userResponse: "answer" }
  });
}
\`\`\`

### **🛠️ INTEGRATING AGENTS & TOOLS**

**Using Agents in Steps:**
\`\`\`typescript
// Method 1: Agent as step
const agentStep = createStep(myAgent);

// Method 2: Call agent in execute function
const step = createStep({
  execute: async ({ inputData }) => {
    const result = await myAgent.generate(prompt);
    return { output: result.text };
  }
});
\`\`\`

**Using Tools in Steps:**
\`\`\`typescript
// Method 1: Tool as step  
const toolStep = createStep(myTool);

// Method 2: Call tool in execute function
const step = createStep({
  execute: async ({ inputData, runtimeContext }) => {
    const result = await myTool.execute({
      context: inputData,
      runtimeContext
    });
    return result;
  }
});
\`\`\`

### **🗂️ PROJECT ORGANIZATION PATTERNS**

**MANDATORY Workflow Organization:**
Each workflow MUST be organized in its own dedicated folder with separated concerns:

\`\`\`
src/mastra/workflows/
├── my-workflow-name/         # Kebab-case folder name
│   ├── types.ts             # All Zod schemas and TypeScript types
│   ├── steps.ts             # All individual step definitions
│   ├── workflow.ts          # Main workflow composition and export
│   └── utils.ts             # Helper functions (if needed)
├── another-workflow/
│   ├── types.ts
│   ├── steps.ts
│   ├── workflow.ts
│   └── utils.ts
└── index.ts                 # Export all workflows
\`\`\`

**CRITICAL File Organization Rules:**
- **ALWAYS create a dedicated folder** for each workflow
- **Folder names MUST be kebab-case** version of workflow name
- **types.ts**: Define all input/output schemas, validation types, and interfaces
- **steps.ts**: Create all individual step definitions using createStep()
- **workflow.ts**: Compose steps into workflow using createWorkflow() and export the final workflow
- **utils.ts**: Any helper functions, constants, or utilities (create only if needed)
- **NEVER put everything in one file** - always separate concerns properly

**Workflow Registration:**
\`\`\`typescript
// src/mastra/index.ts
export const mastra = new Mastra({
  workflows: {
    sendEmailWorkflow,      // Use camelCase for keys
    dataProcessingWorkflow
  },
  storage: new LibSQLStore({ url: 'file:./mastra.db' }), // Required for suspend/resume
});
\`\`\`

### **📦 ESSENTIAL DEPENDENCIES**

**Required Packages:**
\`\`\`json
{
  "dependencies": {
    "@mastra/core": "latest",
    "zod": "^3.25.67"
  }
}
\`\`\`

**Additional Packages (as needed):**
- \`@mastra/libsql\`: For workflow state persistence
- \`@ai-sdk/openai\`: For AI model integration
- \`ai\`: For AI SDK functionality

### **✅ WORKFLOW BEST PRACTICES**

**Schema Design:**
- Use descriptive property names in schemas
- Make schemas as specific as possible (avoid \`z.any()\`)
- Include validation for required business logic

**Error Handling:**
- Use \`try/catch\` blocks in step execute functions
- Return meaningful error messages
- Consider using \`bail()\` for early successful exits

**Step Organization:**
- Keep steps focused on single responsibilities
- Use descriptive step IDs (kebab-case recommended)
- Create reusable steps for common operations

**Data Flow:**
- Use \`.map()\` when schemas don't align between steps
- Access previous step results with \`getStepResult(stepInstance)\`
- Use \`getInitData()\` to access original workflow input

### **🚀 EXECUTION PATTERNS**

**Running Workflows:**
\`\`\`typescript
// Create and start run
const run = await workflow.createRunAsync();
const result = await run.start({ inputData: {...} });

// Stream execution for real-time monitoring
const stream = await run.streamVNext({ inputData: {...} });
for await (const chunk of stream) {
  console.log(chunk);
}

// Watch for events
run.watch((event) => console.log(event));
\`\`\`

**Workflow Status Types:**
- \`"success"\`: Completed successfully
- \`"suspended"\`: Paused awaiting input
- \`"failed"\`: Encountered error

### **🔗 ADVANCED FEATURES**

**Nested Workflows:**
- Use workflows as steps: \`.then(otherWorkflow)\`
- Enable complex workflow composition

**Runtime Context:**
- Pass shared data across all steps
- Enable dependency injection patterns

**Streaming & Events:**
- Real-time workflow monitoring
- Integration with external event systems

**Cloning:**
- \`cloneWorkflow(original, {id: "new-id"})\`: Reuse workflow structure
- \`cloneStep(original, {id: "new-id"})\`: Reuse step logic

This comprehensive research provides the foundation for creating robust, maintainable Mastra workflows with proper typing, error handling, and architectural patterns.
`;
// Step 1: Always discover existing workflows
const workflowDiscoveryStep = createStep({
  id: 'workflow-discovery',
  description: 'Discover existing workflows in the project',
  inputSchema: WorkflowBuilderInputSchema,
  outputSchema: WorkflowDiscoveryResultSchema,
  execute: async ({ inputData, runtimeContext: _runtimeContext }) => {
    console.log('Starting workflow discovery...');
    const { projectPath = process.cwd() } = inputData;

    try {
      // Check if workflows directory exists
      const workflowsPath = join(projectPath, 'src/mastra/workflows');
      if (!existsSync(workflowsPath)) {
        console.log('No workflows directory found');
        return {
          success: true,
          workflows: [],
          mastraIndexExists: existsSync(join(projectPath, 'src/mastra/index.ts')),
          message: 'No existing workflows found in the project',
        };
      }

      // Read workflow files directly
      const workflowFiles = await readdir(workflowsPath);
      const workflows: z.infer<typeof DiscoveredWorkflowSchema>[] = [];

      for (const fileName of workflowFiles) {
        if (fileName.endsWith('.ts') && !fileName.endsWith('.test.ts')) {
          const filePath = join(workflowsPath, fileName);
          try {
            const content = await readFile(filePath, 'utf-8');

            // Extract basic workflow info
            const nameMatch = content.match(/createWorkflow\s*\(\s*{\s*id:\s*['"]([^'"]+)['"]/);
            const descMatch = content.match(/description:\s*['"]([^'"]*)['"]/);

            if (nameMatch && nameMatch[1]) {
              workflows.push({
                name: nameMatch[1],
                file: filePath,
                description: descMatch?.[1] ?? 'No description available',
              });
            }
          } catch (error) {
            console.warn(`Failed to read workflow file ${filePath}:`, error);
          }
        }
      }

      console.log(`Discovered ${workflows.length} existing workflows`);
      return {
        success: true,
        workflows,
        mastraIndexExists: existsSync(join(projectPath, 'src/mastra/index.ts')),
        message:
          workflows.length > 0
            ? `Found ${workflows.length} existing workflow(s): ${workflows.map(w => w.name).join(', ')}`
            : 'No existing workflows found in the project',
      };
    } catch (error) {
      console.error('Workflow discovery failed:', error);
      return {
        success: false,
        workflows: [],
        mastraIndexExists: false,
        message: `Workflow discovery failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Step 2: Always discover project structure
const projectDiscoveryStep = createStep({
  id: 'project-discovery',
  description: 'Analyze the project structure and setup',
  inputSchema: WorkflowDiscoveryResultSchema,
  outputSchema: ProjectDiscoveryResultSchema,
  execute: async ({ inputData: _inputData, runtimeContext: _runtimeContext }) => {
    console.log('Starting project discovery...');

    try {
      // Get project structure - no need for AgentBuilder since we're just checking files
      const projectPath = process.cwd(); // Use current working directory as default
      const projectStructure = {
        hasPackageJson: existsSync(join(projectPath, 'package.json')),
        hasMastraConfig:
          existsSync(join(projectPath, 'mastra.config.js')) || existsSync(join(projectPath, 'mastra.config.ts')),
        hasSrcDirectory: existsSync(join(projectPath, 'src')),
        hasMastraDirectory: existsSync(join(projectPath, 'src/mastra')),
        hasWorkflowsDirectory: existsSync(join(projectPath, 'src/mastra/workflows')),
        hasToolsDirectory: existsSync(join(projectPath, 'src/mastra/tools')),
        hasAgentsDirectory: existsSync(join(projectPath, 'src/mastra/agents')),
      };

      // Read package.json if it exists
      let packageInfo = null;
      if (projectStructure.hasPackageJson) {
        try {
          const packageContent = await readFile(join(projectPath, 'package.json'), 'utf-8');
          packageInfo = JSON.parse(packageContent);
        } catch (error) {
          console.warn('Failed to read package.json:', error);
        }
      }

      console.log('Project discovery completed');
      return {
        success: true,
        structure: {
          hasWorkflowsDir: projectStructure.hasWorkflowsDirectory,
          hasAgentsDir: projectStructure.hasAgentsDirectory,
          hasToolsDir: projectStructure.hasToolsDirectory,
          hasMastraIndex: existsSync(join(projectPath, 'src/mastra/index.ts')),
          existingWorkflows: [],
          existingAgents: [],
          existingTools: [],
        },
        dependencies: packageInfo?.dependencies || {},
        message: 'Project discovery completed successfully',
      };
    } catch (error) {
      console.error('Project discovery failed:', error);
      return {
        success: false,
        structure: {
          hasWorkflowsDir: false,
          hasAgentsDir: false,
          hasToolsDir: false,
          hasMastraIndex: false,
          existingWorkflows: [],
          existingAgents: [],
          existingTools: [],
        },
        dependencies: {},
        message: 'Project discovery failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Step 3: Research what is needed to be done
const workflowResearchStep = createStep({
  id: 'workflow-research',
  description: 'Research Mastra workflows and gather relevant documentation',
  inputSchema: ProjectDiscoveryResultSchema,
  outputSchema: WorkflowResearchResultSchema,
  execute: async ({ inputData, runtimeContext }) => {
    console.log('Starting workflow research...');

    try {
      // const filteredMcpTools = await initializeMcpTools();

      const researchAgent = new Agent({
        model: resolveModel(runtimeContext),
        instructions: `You are a Mastra workflow research expert. Your task is to gather relevant information about creating Mastra workflows.

RESEARCH OBJECTIVES:
1. **Core Concepts**: Understand how Mastra workflows work
2. **Best Practices**: Learn workflow patterns and conventions  
3. **Code Examples**: Find relevant implementation examples
4. **Technical Details**: Understand schemas, steps, and configuration

Use the available documentation and examples tools to gather comprehensive information about Mastra workflows.`,
        name: 'Workflow Research Agent',
        // tools: filteredMcpTools,
      });

      const researchPrompt = `Research everything about Mastra workflows to help create or edit them effectively.

PROJECT CONTEXT:
- Project Structure: ${JSON.stringify(inputData.structure, null, 2)}
- Dependencies: ${JSON.stringify(inputData.dependencies, null, 2)}
- Has Workflows Directory: ${inputData.structure.hasWorkflowsDir}

Focus on:
1. How to create workflows using createWorkflow()
2. How to create and chain workflow steps
3. Best practices for workflow organization
4. Common workflow patterns and examples
5. Schema definitions and types
6. Error handling and debugging

Use the docs and examples tools to gather comprehensive information.`;

      const researchOutputSchema = z.object({
        coreConceptsLearned: z.string().describe('Key concepts about Mastra workflows'),
        bestPractices: z.string().describe('Best practices for workflow development'),
        relevantExamples: z.string().describe('Relevant code examples found'),
        technicalDetails: z.string().describe('Technical implementation details'),
        recommendations: z.string().describe('Specific recommendations for this project'),
      });

      const result = await researchAgent.generateVNext(researchPrompt, {
        output: researchOutputSchema,
        // stopWhen: stepCountIs(10),
      });

      const researchResult: z.infer<typeof researchOutputSchema> = await result.object;
      if (!researchResult) {
        return {
          success: false,
          documentation: {
            workflowPatterns: [],
            stepExamples: [],
            bestPractices: [],
          },
          webResources: [],
          message: 'Research agent failed to generate valid response',
          error: 'Research agent failed to generate valid response',
        };
      }

      console.log('Research completed successfully');
      return {
        success: true,
        documentation: {
          workflowPatterns: researchResult.bestPractices.split('\n').filter(line => line.trim()),
          stepExamples: researchResult.relevantExamples.split('\n').filter(line => line.trim()),
          bestPractices: researchResult.recommendations.split('\n').filter(line => line.trim()),
        },
        webResources: [],
        message: 'Research completed successfully',
      };
    } catch (error) {
      console.error('Workflow research failed:', error);
      return {
        success: false,
        documentation: {
          workflowPatterns: [],
          stepExamples: [],
          bestPractices: [],
        },
        webResources: [],
        message: 'Research failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Task execution step remains the same
const taskExecutionStep = createStep({
  id: 'task-execution',
  description: 'Execute the approved task list to create or edit the workflow',
  inputSchema: z.object({
    action: z.enum(['create', 'edit']),
    workflowName: z.string().optional(),
    description: z.string().optional(),
    requirements: z.string().optional(),
    tasks: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
        priority: z.enum(['high', 'medium', 'low']),
        dependencies: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    ),
    discoveredWorkflows: z.array(z.any()),
    projectStructure: z.any(),
    research: z.any(),
    projectPath: z.string().optional(),
  }),
  outputSchema: TaskExecutionResultSchema,
  suspendSchema: z.object({
    questions: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        type: z.enum(['choice', 'text', 'boolean']),
        options: z.array(z.string()).optional(),
        context: z.string().optional(),
      }),
    ),
    currentProgress: z.string(),
    completedTasks: z.array(z.string()),
    message: z.string(),
  }),
  resumeSchema: z.object({
    answers: z.array(
      z.object({
        questionId: z.string(),
        answer: z.string(),
      }),
    ),
  }),
  execute: async ({ inputData, resumeData, suspend, runtimeContext }) => {
    const {
      action,
      workflowName,
      description,
      requirements,
      tasks,
      discoveredWorkflows,
      projectStructure,
      research,
      projectPath,
    } = inputData;

    console.log(`Starting task execution for ${action}ing workflow: ${workflowName}`);
    console.log(`Executing ${tasks.length} tasks using AgentBuilder stream...`);

    try {
      const currentProjectPath = projectPath || process.cwd();

      // Pre-populate taskManager with the planned tasks
      console.log('Pre-populating taskManager with planned tasks...');
      const taskManagerContext = {
        action: 'create' as const,
        tasks: tasks.map(task => ({
          id: task.id,
          content: task.content,
          status: 'pending' as const,
          priority: task.priority,
          dependencies: task.dependencies,
          notes: task.notes,
        })),
      };

      const taskManagerResult = await AgentBuilderDefaults.manageTaskList(taskManagerContext);
      console.log(`Task manager initialized with ${taskManagerResult.tasks.length} tasks`);

      if (!taskManagerResult.success) {
        throw new Error(`Failed to initialize task manager: ${taskManagerResult.message}`);
      }

      // Create a restricted taskManager tool that only allows updates, not creation
      const restrictedTaskManager = createTool({
        id: 'task-manager',
        description:
          'View and update your pre-loaded task list. You can only mark tasks as in_progress or completed, not create new tasks.',
        inputSchema: z.object({
          action: z
            .enum(['list', 'update', 'complete'])
            .describe('List tasks, update status, or mark complete - tasks are pre-loaded'),
          tasks: z
            .array(
              z.object({
                id: z.string().describe('Task ID - must match existing task'),
                content: z.string().optional().describe('Task content (read-only)'),
                status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).describe('Task status'),
                priority: z.enum(['high', 'medium', 'low']).optional().describe('Task priority (read-only)'),
                dependencies: z.array(z.string()).optional().describe('Task dependencies (read-only)'),
                notes: z.string().optional().describe('Additional notes or progress updates'),
              }),
            )
            .optional()
            .describe('Tasks to update (status and notes only)'),
          taskId: z.string().optional().describe('Specific task ID for single task operations'),
        }),
        outputSchema: z.object({
          success: z.boolean(),
          tasks: z.array(
            z.object({
              id: z.string(),
              content: z.string(),
              status: z.string(),
              priority: z.string(),
              dependencies: z.array(z.string()).optional(),
              notes: z.string().optional(),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          ),
          message: z.string(),
        }),
        execute: async ({ context }) => {
          // Convert to the expected format for manageTaskList
          const adaptedContext = {
            ...context,
            action: context.action as 'list' | 'update' | 'complete' | 'create' | 'remove',
            tasks: context.tasks?.map(task => ({
              ...task,
              priority: task.priority || ('medium' as const),
            })),
          };
          return await AgentBuilderDefaults.manageTaskList(adaptedContext);
        },
      });

      const executionAgent = new AgentBuilder({
        projectPath: currentProjectPath,
        model: resolveModel(runtimeContext),
        tools: {
          'task-manager': restrictedTaskManager,
        },
        instructions: `You are executing a workflow ${action} task for: "${workflowName}"

CRITICAL WORKFLOW EXECUTION REQUIREMENTS:
1. **EXPLORE PROJECT STRUCTURE FIRST**: Use listDirectory and readFile tools to understand the existing project layout, folder structure, and conventions before creating any files
2. **FOLLOW PROJECT CONVENTIONS**: Look at existing workflows, agents, and file structures to understand where new files should be placed (typically src/mastra/workflows/, src/mastra/agents/, etc.)
3. **USE PRE-LOADED TASK LIST**: Your task list has been pre-populated in the taskManager tool. Use taskManager with action 'list' to see all tasks, and action 'update' to mark progress
4. **COMPLETE EVERY SINGLE TASK**: You MUST complete ALL ${tasks.length} tasks that are already in the taskManager. Do not stop until every task is marked as 'completed'
5. **Follow Task Dependencies**: Execute tasks in the correct order, respecting dependencies
6. **Request User Input When Needed**: If you encounter choices (like email providers, databases, etc.) that require user decision, return questions for clarification
7. **STRICT WORKFLOW ORGANIZATION**: When creating or editing workflows, you MUST follow this exact structure

MANDATORY WORKFLOW FOLDER STRUCTURE:
When ${action === 'create' ? 'creating a new workflow' : 'editing a workflow'}, you MUST organize files as follows:

📁 src/mastra/workflows/${workflowName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'new-workflow'}/
├── 📄 types.ts          # All Zod schemas and TypeScript types
├── 📄 steps.ts          # All individual step definitions  
├── 📄 workflow.ts       # Main workflow composition and export
└── 📄 utils.ts          # Helper functions (if needed)

CRITICAL FILE ORGANIZATION RULES:
- **ALWAYS create a dedicated folder** for the workflow in src/mastra/workflows/
- **Folder name MUST be kebab-case** version of workflow name
- **types.ts**: Define all input/output schemas, validation types, and interfaces
- **steps.ts**: Create all individual step definitions using createStep()
- **workflow.ts**: Compose steps into workflow using createWorkflow() and export the final workflow
- **utils.ts**: Any helper functions, constants, or utilities (create only if needed)
- **NEVER put everything in one file** - always separate concerns properly

CRITICAL COMPLETION REQUIREMENTS: 
- ALWAYS explore the directory structure before creating files to understand where they should go
- You MUST complete ALL ${tasks.length} tasks before returning status='completed'
- Use taskManager tool with action 'list' to see your current task list and action 'update' to mark tasks as 'in_progress' or 'completed'
- If you need to make any decisions during implementation (choosing providers, configurations, etc.), return questions for user clarification
- DO NOT make assumptions about file locations - explore first!
- You cannot finish until ALL tasks in the taskManager are marked as 'completed'

PROJECT CONTEXT:
- Action: ${action}
- Workflow Name: ${workflowName}
- Description: ${description}
- Requirements: ${requirements}
- Project Path: ${currentProjectPath}
- Discovered Workflows: ${JSON.stringify(discoveredWorkflows, null, 2)}
- Project Structure: ${JSON.stringify(projectStructure, null, 2)}

AVAILABLE RESEARCH:
${JSON.stringify(research, null, 2)}

PRE-LOADED TASK LIST (${tasks.length} tasks already in taskManager):
${tasks.map(task => `- ${task.id}: ${task.content} (Priority: ${task.priority})`).join('\n')}

${resumeData ? `USER PROVIDED ANSWERS: ${JSON.stringify(resumeData.answers, null, 2)}` : ''}

Start by exploring the project structure, then use 'taskManager' with action 'list' to see your pre-loaded tasks, and work through each task systematically.

            CRITICAL VALIDATION INSTRUCTIONS:
            - When using the validateCode tool, ALWAYS pass the specific files you created or modified using the 'files' parameter
            - The tool uses a hybrid validation approach: fast syntax checking → semantic type checking → ESLint
            - This is much faster than full project compilation and only shows errors from your specific files
            - Example: validateCode({ validationType: ['types', 'lint'], files: ['src/workflows/my-workflow.ts', 'src/agents/my-agent.ts'] })
            - ALWAYS validate after creating or modifying files to ensure they compile correctly`,
      });

      // Create the execution prompt
      const executionPrompt = resumeData
        ? `Continue working on the task list. The user has provided answers to your questions: ${JSON.stringify(resumeData.answers, null, 2)}. 

CRITICAL: You must complete ALL ${tasks.length} tasks that are pre-loaded in the taskManager. Use the taskManager tool with action 'list' to check your progress and continue with the next tasks. Do not stop until every single task is marked as 'completed'.`
        : `Begin executing the pre-loaded task list to ${action} the workflow "${workflowName}". 

CRITICAL REQUIREMENTS:
- Your ${tasks.length} tasks have been PRE-LOADED into the taskManager tool
- Start by exploring the project directory structure using listDirectory and readFile tools to understand:
  - Where workflows are typically stored (look for src/mastra/workflows/ or similar)
  - What the existing file structure looks like
  - How other workflows are organized and named
  - Where agent files are stored if needed
- Then use taskManager with action 'list' to see your pre-loaded tasks
- Use taskManager with action 'update' to mark tasks as 'in_progress' or 'completed'

MANDATORY WORKFLOW FILE ORGANIZATION:
You MUST create workflow files using this EXACT structure:

📁 src/mastra/workflows/${workflowName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'new-workflow'}/
├── 📄 types.ts          # All Zod schemas and TypeScript types
├── 📄 steps.ts          # All individual step definitions  
├── 📄 workflow.ts       # Main workflow composition and export
└── 📄 utils.ts          # Helper functions (if needed)

CRITICAL FILE ORGANIZATION RULES:
- **ALWAYS create a dedicated folder** for the workflow in src/mastra/workflows/
- **Folder name MUST be kebab-case** version of workflow name  
- **NEVER put everything in one file** - separate types, steps, and workflow composition
- Follow the 4-file structure above for maximum maintainability and clarity

- DO NOT return status='completed' until ALL ${tasks.length} tasks are marked as 'completed' in the taskManager

            CRITICAL VALIDATION INSTRUCTIONS:
            - When using the validateCode tool, ALWAYS pass the specific files you created or modified using the 'files' parameter
            - The tool uses a hybrid validation approach: fast syntax checking → semantic type checking → ESLint
            - This is much faster than full project compilation and only shows errors from your specific files
            - Example: validateCode({ validationType: ['types', 'lint'], files: ['src/workflows/my-workflow.ts', 'src/agents/my-agent.ts'] })
            - ALWAYS validate after creating or modifying files to ensure they compile correctly

PRE-LOADED TASKS (${tasks.length} total tasks in taskManager):
${tasks.map((task, index) => `${index + 1}. [${task.id}] ${task.content}`).join('\n')}

Use taskManager with action 'list' to see the current status of all tasks. You must complete every single one before finishing.`;

      const originalInstructions = await executionAgent.getInstructions({ runtimeContext: runtimeContext });
      const additionalInstructions = executionAgent.instructions;

      let enhancedInstructions = originalInstructions as string;
      if (additionalInstructions) {
        enhancedInstructions = `${originalInstructions}\n\n${additionalInstructions}`;
      }

      const enhancedOptions = {
        stopWhen: stepCountIs(100),
        temperature: 0.3,
        instructions: enhancedInstructions,
      };

      // Loop until all tasks are completed
      let finalResult: any = null;
      let allTasksCompleted = false;
      let iterationCount = 0;
      const maxIterations = 5; // Prevent infinite loops

      const expectedTaskIds = tasks.map(task => task.id);

      while (!allTasksCompleted && iterationCount < maxIterations) {
        iterationCount++;

        // Check current task status from taskManager
        const currentTaskStatus = await AgentBuilderDefaults.manageTaskList({ action: 'list' });
        const completedTasks = currentTaskStatus.tasks.filter(task => task.status === 'completed');
        const pendingTasks = currentTaskStatus.tasks.filter(task => task.status !== 'completed');

        console.log(`\n=== EXECUTION ITERATION ${iterationCount} ===`);
        console.log(`Completed tasks: ${completedTasks.length}/${expectedTaskIds.length}`);
        console.log(`Remaining tasks: ${pendingTasks.map(t => t.id).join(', ')}`);

        // Check if all tasks are completed
        allTasksCompleted = pendingTasks.length === 0;

        if (allTasksCompleted) {
          console.log('All tasks completed! Breaking execution loop.');
          break;
        }

        // Create prompt for this iteration
        const iterationPrompt =
          iterationCount === 1
            ? executionPrompt
            : `Continue working on the remaining tasks. You have already completed these tasks: [${completedTasks.map(t => t.id).join(', ')}]

REMAINING TASKS TO COMPLETE (${pendingTasks.length} tasks):
${pendingTasks.map((task, index) => `${index + 1}. [${task.id}] ${task.content}`).join('\n')}

REMINDER - MANDATORY WORKFLOW FILE ORGANIZATION:
You MUST create workflow files using this EXACT structure:

📁 src/mastra/workflows/${workflowName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'new-workflow'}/
├── 📄 types.ts          # All Zod schemas and TypeScript types
├── 📄 steps.ts          # All individual step definitions  
├── 📄 workflow.ts       # Main workflow composition and export
└── 📄 utils.ts          # Helper functions (if needed)

CRITICAL: You must complete ALL of these remaining ${pendingTasks.length} tasks. Use taskManager with action 'list' to check current status and action 'update' to mark tasks as completed.

            CRITICAL VALIDATION INSTRUCTIONS:
            - When using the validateCode tool, ALWAYS pass the specific files you created or modified using the 'files' parameter
            - The tool uses a hybrid validation approach: fast syntax checking → semantic type checking → ESLint
            - This is much faster than full project compilation and only shows errors from your specific files
            - Example: validateCode({ validationType: ['types', 'lint'], files: ['src/workflows/my-workflow.ts', 'src/agents/my-agent.ts'] })
            - ALWAYS validate after creating or modifying files to ensure they compile correctly

${resumeData ? `USER PROVIDED ANSWERS: ${JSON.stringify(resumeData.answers, null, 2)}` : ''}`;

        // Use stream to let the agent manage its own execution
        const stream = await executionAgent.streamVNext(iterationPrompt, {
          structuredOutput: {
            schema: z.object({
              status: z
                .enum(['in_progress', 'completed', 'needs_clarification'])
                .describe('Status - only use "completed" when ALL remaining tasks are finished'),
              progress: z.string().describe('Current progress description'),
              completedTasks: z
                .array(z.string())
                .describe('List of ALL completed task IDs (including previously completed ones)'),
              totalTasksRequired: z
                .number()
                .describe(`Total number of tasks that must be completed (should be ${tasks.length})`),
              tasksRemaining: z.array(z.string()).describe('List of task IDs that still need to be completed'),
              filesModified: z
                .array(z.string())
                .describe('List of files that were created or modified - use these exact paths for validateCode tool'),
              questions: z
                .array(
                  z.object({
                    id: z.string(),
                    question: z.string(),
                    type: z.enum(['choice', 'text', 'boolean']),
                    options: z.array(z.string()).optional(),
                    context: z.string().optional(),
                  }),
                )
                .optional()
                .describe('Questions for user if clarification is needed'),
              message: z.string().describe('Summary of work completed or current status'),
              error: z.string().optional().describe('Any errors encountered'),
            }),
            model: resolveModel(runtimeContext),
          },
          ...enhancedOptions,
        });

        // Process the stream and get the final result
        let finalMessage = '';
        for await (const chunk of stream.fullStream) {
          if (chunk.type === 'text-delta') {
            finalMessage += chunk.payload.text;
          }

          if (chunk.type === 'step-finish') {
            console.log(finalMessage);
            finalMessage = '';
          }

          if (chunk.type === 'tool-result') {
            console.log(JSON.stringify(chunk, null, 2));
          }

          if (chunk.type === 'finish') {
            console.log(chunk);
          }
        }

        await stream.consumeStream();
        finalResult = await stream.object;

        console.log(`Iteration ${iterationCount} result:`, { finalResult });

        if (!finalResult) {
          throw new Error(`No result received from agent execution on iteration ${iterationCount}`);
        }

        // Check task completion status from taskManager instead of relying on agent response
        const postIterationTaskStatus = await AgentBuilderDefaults.manageTaskList({ action: 'list' });
        const postCompletedTasks = postIterationTaskStatus.tasks.filter(task => task.status === 'completed');
        const postPendingTasks = postIterationTaskStatus.tasks.filter(task => task.status !== 'completed');

        allTasksCompleted = postPendingTasks.length === 0;

        console.log(
          `After iteration ${iterationCount}: ${postCompletedTasks.length}/${expectedTaskIds.length} tasks completed in taskManager`,
        );

        // If agent needs clarification, break out and suspend
        if (finalResult.status === 'needs_clarification' && finalResult.questions && finalResult.questions.length > 0) {
          console.log(
            `Agent needs clarification on iteration ${iterationCount}: ${finalResult.questions.length} questions`,
          );
          break;
        }

        // If agent claims completed but taskManager shows pending tasks, continue loop
        if (finalResult.status === 'completed' && !allTasksCompleted) {
          console.log(
            `Agent claimed completion but taskManager shows pending tasks: ${postPendingTasks.map(t => t.id).join(', ')}`,
          );
          // Continue to next iteration
        }
      }

      if (iterationCount >= maxIterations && !allTasksCompleted) {
        finalResult.error = `Maximum iterations (${maxIterations}) reached but not all tasks completed`;
        finalResult.status = 'in_progress';
      }

      if (!finalResult) {
        throw new Error('No result received from agent execution');
      }

      // If the agent needs clarification, suspend the workflow
      if (finalResult.status === 'needs_clarification' && finalResult.questions && finalResult.questions.length > 0) {
        console.log(`Agent needs clarification: ${finalResult.questions.length} questions`);

        console.log('finalResult', JSON.stringify(finalResult, null, 2));
        await suspend({
          questions: finalResult.questions,
          currentProgress: finalResult.progress,
          completedTasks: finalResult.completedTasks || [],
          message: finalResult.message,
        });

        // This return won't be reached due to suspension, but TypeScript needs it
        return {
          success: false,
          completedTasks: finalResult.completedTasks || [],
          filesModified: finalResult.filesModified || [],
          validationResults: {
            passed: false,
            errors: [],
            warnings: ['Workflow suspended for user clarification'],
          },
          message: 'Workflow suspended for user clarification',
        };
      }

      // Final validation after loop completion - check taskManager status
      const finalTaskStatus = await AgentBuilderDefaults.manageTaskList({ action: 'list' });
      const finalCompletedTasks = finalTaskStatus.tasks.filter(task => task.status === 'completed');
      const finalPendingTasks = finalTaskStatus.tasks.filter(task => task.status !== 'completed');

      const tasksCompleted = finalCompletedTasks.length;
      const tasksExpected = expectedTaskIds.length;
      const finalAllTasksCompleted = finalPendingTasks.length === 0;

      // Determine success based on taskManager status
      const success = finalAllTasksCompleted && !finalResult.error;
      const message = success
        ? `Successfully completed workflow ${action} - all ${tasksExpected} tasks completed after ${iterationCount} iteration(s): ${finalResult.message}`
        : `Workflow execution finished with issues after ${iterationCount} iteration(s): ${finalResult.message}. Completed: ${tasksCompleted}/${tasksExpected} tasks`;

      console.log(message);

      // Build validation results with task completion details
      const missingTasks = finalPendingTasks.map(task => task.id);
      const validationErrors = [];

      if (finalResult.error) {
        validationErrors.push(finalResult.error);
      }

      if (!finalAllTasksCompleted) {
        validationErrors.push(
          `Incomplete tasks: ${missingTasks.join(', ')} (${tasksCompleted}/${tasksExpected} completed)`,
        );
      }

      return {
        success,
        completedTasks: finalCompletedTasks.map(task => task.id),
        filesModified: finalResult.filesModified || [],
        validationResults: {
          passed: success,
          errors: validationErrors,
          warnings: finalAllTasksCompleted ? [] : [`Missing ${missingTasks.length} tasks: ${missingTasks.join(', ')}`],
        },
        message,
        error: finalResult.error,
      };
    } catch (error) {
      console.error('Task execution failed:', error);
      return {
        success: false,
        completedTasks: [],
        filesModified: [],
        validationResults: {
          passed: false,
          errors: [`Task execution failed: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
        },
        message: `Task execution failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Main Workflow Builder Workflow
export const workflowBuilderWorkflow = createWorkflow({
  id: 'workflow-builder',
  description: 'Create or edit Mastra workflows using AI-powered assistance with iterative planning',
  inputSchema: WorkflowBuilderInputSchema,
  outputSchema: WorkflowBuilderResultSchema,
  steps: [
    workflowDiscoveryStep,
    projectDiscoveryStep,
    workflowResearchStep,
    planningAndApprovalWorkflow,
    taskExecutionStep,
  ],
})
  // Step 1: Always discover existing workflows
  .then(workflowDiscoveryStep)
  // Step 2: Always discover project structure
  .then(projectDiscoveryStep)
  // Step 3: Research workflows and documentation
  .then(workflowResearchStep)
  // Map research result to planning input format
  .map(async ({ getStepResult, getInitData }) => {
    const initData = getInitData();
    const discoveryResult = getStepResult(workflowDiscoveryStep);
    const projectResult = getStepResult(projectDiscoveryStep);
    // const researchResult = getStepResult(workflowResearchStep);

    return {
      action: initData.action,
      workflowName: initData.workflowName,
      description: initData.description,
      requirements: initData.requirements,
      discoveredWorkflows: discoveryResult.workflows,
      projectStructure: projectResult,
      // research: researchResult,
      research,
      previousPlan: undefined,
      userAnswers: undefined,
    };
  })
  // Step 4: Planning and Approval Sub-workflow (loops until approved)
  .dountil(planningAndApprovalWorkflow, async ({ inputData }) => {
    // Continue looping until user approves the task list
    console.log(`Sub-workflow check: approved=${inputData.approved}`);
    return inputData.approved === true;
  })
  // Map sub-workflow result to task execution input
  .map(async ({ getStepResult, getInitData }) => {
    const initData = getInitData();
    const discoveryResult = getStepResult(workflowDiscoveryStep);
    const projectResult = getStepResult(projectDiscoveryStep);
    // const researchResult = getStepResult(workflowResearchStep);
    const subWorkflowResult = getStepResult(planningAndApprovalWorkflow);

    return {
      action: initData.action,
      workflowName: initData.workflowName,
      description: initData.description,
      requirements: initData.requirements,
      tasks: subWorkflowResult.tasks,
      discoveredWorkflows: discoveryResult.workflows,
      projectStructure: projectResult,
      // research: researchResult,
      research,
      projectPath: initData.projectPath || process.cwd(),
    };
  })
  // Step 5: Execute the approved tasks
  .then(taskExecutionStep)
  .commit();

// Helper function to create a workflow
export async function createWorkflowWithBuilder(
  workflowName: string,
  description: string,
  requirements: string,
  projectPath: string,
) {
  console.log(`Creating workflow: ${workflowName}`);

  // This would be called by the CLI or other entry points
  // The actual workflow execution would be handled by the Mastra engine
  return {
    workflowName,
    description,
    requirements,
    projectPath,
    action: 'create' as const,
  };
}

// Helper function to edit a workflow
export async function editWorkflowWithBuilder(
  workflowName: string,
  description: string,
  requirements: string,
  projectPath: string,
) {
  console.log(`Editing workflow: ${workflowName}`);

  return {
    workflowName,
    description,
    requirements,
    projectPath,
    action: 'edit' as const,
  };
}
