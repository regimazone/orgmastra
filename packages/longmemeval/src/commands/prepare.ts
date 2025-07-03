import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { MockLanguageModelV1 } from '../test-utils/mock-model';
import { openai } from '@ai-sdk/openai';
import chalk from 'chalk';
import ora from 'ora';
import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';

import { DatasetLoader } from '../data/loader';
import { BenchmarkStore, BenchmarkVectorStore } from '../storage';
import type { LongMemEvalQuestion, MemoryConfigOptions } from '../data/types';
import type { CoreMessage } from 'ai';

async function removeMessagesFromSessions(store: BenchmarkStore, sessionIds: string[], questionDir: string) {
  // Save current state to a temp file
  const tempPath = join(questionDir, 'temp_db.json');
  await store.persist(tempPath);

  // Read and modify the data
  const data = JSON.parse(await readFile(tempPath, 'utf-8'));

  // Count messages before filtering
  const messagesBefore = data.mastra_messages?.length || 0;

  // Filter out messages from the sessions we want to remove
  if (data.mastra_messages) {
    data.mastra_messages = data.mastra_messages.filter(([_, message]: any[]) => {
      return !sessionIds.includes(message.threadId);
    });
  }

  // Also remove the threads themselves
  if (data.mastra_threads) {
    data.mastra_threads = data.mastra_threads.filter(([threadId, _]: any[]) => {
      return !sessionIds.includes(threadId);
    });
  }

  const messagesAfter = data.mastra_messages?.length || 0;
  console.log(chalk.gray(`Removed ${messagesBefore - messagesAfter} messages from ${sessionIds.length} sessions`));

  // Write back the modified data
  await writeFile(tempPath, JSON.stringify(data, null, 2));

  // Reload the modified data into the store
  await store.hydrate(tempPath);

  // Clean up temp file
  await require('fs/promises').unlink(tempPath);
}

export interface PrepareOptions {
  dataset: 'longmemeval_s' | 'longmemeval_m' | 'longmemeval_oracle';
  memoryConfig: 'full-history' | 'last-k' | 'semantic-recall' | 'working-memory' | 'combined';
  outputDir?: string;
  subset?: number;
  concurrency?: number;
  questionId?: string;
  resumeFromMessageId?: string;
  sessionLimit?: number;
  sessionOffset?: number;
}

export class PrepareCommand {
  private loader: DatasetLoader;
  private baseDir: string;

  constructor() {
    this.loader = new DatasetLoader();
    this.baseDir = './prepared-data';
  }

  async run(options: PrepareOptions): Promise<void> {
    console.log(chalk.blue('\n🔧 Preparing LongMemEval Data\n'));

    // Load dataset
    const spinner = ora('Loading dataset...').start();
    const questions = await this.loader.loadDataset(options.dataset);
    spinner.succeed(`Loaded ${questions.length} questions`);

    // Filter by questionId if specified
    let questionsToProcess = questions;
    if (options.questionId) {
      questionsToProcess = questions.filter(q => q.question_id === options.questionId);
      if (questionsToProcess.length === 0) {
        throw new Error(`Question with ID "${options.questionId}" not found in dataset`);
      }
      console.log(chalk.yellow(`\nFocusing on question: ${options.questionId}\n`));
    } else if (options.subset) {
      // Apply subset if requested
      questionsToProcess = questions.slice(0, options.subset);
    }

    console.log(
      chalk.yellow(`\nProcessing ${questionsToProcess.length} question${questionsToProcess.length !== 1 ? 's' : ''}\n`),
    );

    // Get memory configuration
    const memoryOptions = this.getMemoryOptions(options.memoryConfig);

    // Use real model for working memory, mock for others
    const needsRealModel = options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined';

    if (needsRealModel && !process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for working memory preparation');
    }

    const model = needsRealModel
      ? openai('gpt-4o')
      : new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
          }),
        });

    // Track active questions progress
    const activeQuestions = new Map<number, { questionId: string; status: string }>();

    // Create main progress spinner
    const mainSpinner = ora('Starting data preparation...').start();

    let processedCount = 0;
    let cachedCount = 0;
    let completedCount = 0; // Total completed (processed + cached)
    let inProgressCount = 0; // Currently processing
    const startTime = Date.now();

    // Determine question batch size based on config
    const questionConcurrency = options.concurrency || 10; // Allow concurrency for all configs

    console.log(chalk.gray(`Question concurrency: ${questionConcurrency}`));

    // Warn about working memory concurrency
    if ((options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined') && questionConcurrency > 1) {
      console.log(
        chalk.yellow(
          `⚠️  Note: Running working memory questions concurrently. Each question has its own resource scope.`,
        ),
      );
    }

    let lastText = ``;
    // Function to update progress display
    const updateProgress = () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = elapsed > 0 ? completedCount / elapsed : 0;
      const remaining = rate > 0 ? Math.round((questionsToProcess.length - completedCount) / rate) : 0;

      // Build progress text with active questions
      let progressText = `Overall: ${completedCount}/${questionsToProcess.length} (${inProgressCount} in progress, ${cachedCount} cached, ~${remaining}s remaining)`;

      if (activeQuestions.size > 0) {
        progressText += '\n\nActive questions:';

        // Sort active questions by completion percentage
        const sortedQuestions = Array.from(activeQuestions.entries())
          .map(([index, info]) => {
            // Extract progress from status like "Processing session 45 (44/100 total)"
            const match = info.status.match(/\((\d+)\/(\d+) total\)/);
            const progress = match ? parseInt(match[1]) / parseInt(match[2]) : 0;
            return { index, info, progress };
          })
          .sort((a, b) => b.progress - a.progress); // Sort by most complete first

        sortedQuestions.forEach(({ index, info, progress }) => {
          const percentage = (progress * 100).toFixed(0);
          progressText += `\n  [${index + 1}] ${info.questionId} - ${info.status} (${percentage}%)`;
        });
      }

      if (lastText !== progressText) {
        lastText = progressText;
        mainSpinner.text = progressText;
      }
    };

    // Create a queue of questions to process
    const questionQueue = [...questionsToProcess];
    let questionIndex = 0;

    // Function to process next question from queue
    const processNextQuestion = async (slotIndex: number): Promise<void> => {
      while (questionQueue.length > 0) {
        const question = questionQueue.shift();
        if (!question) break;

        const currentIndex = questionIndex++;

        // Check if already prepared
        const questionDir = join(
          options.outputDir || this.baseDir,
          options.dataset,
          options.memoryConfig,
          question.question_id,
        );

        // Skip cache check if we're resuming from a specific message
        if (!options.resumeFromMessageId && existsSync(join(questionDir, 'meta.json'))) {
          cachedCount++;
          completedCount++;

          mainSpinner.clear();
          console.log(
            chalk.green(`✓`),
            chalk.blue(`${question.question_id}`),
            chalk.gray(`(${question.question_type})`),
            chalk.yellow(`[cached]`),
            chalk.gray(`- ${completedCount}/${questionsToProcess.length}`),
          );
          mainSpinner.render();

          // Update progress
          updateProgress();

          // Continue to next question
          continue;
        }

        // Mark as in progress
        inProgressCount++;
        activeQuestions.set(slotIndex, { questionId: question.question_id, status: 'Starting...' });
        updateProgress();

        await this.processQuestion(
          question,
          options,
          model,
          memoryOptions,
          mainSpinner,
          currentIndex + 1,
          questionsToProcess.length,
          true, // Always concurrent with worker pool
          slotIndex,
          activeQuestions,
        );

        // Mark as completed
        inProgressCount--;
        processedCount++;
        completedCount++;

        // Remove from active questions
        activeQuestions.delete(slotIndex);

        mainSpinner.clear();
        console.log(
          chalk.green(`✓`),
          chalk.blue(`${question.question_id}`),
          chalk.gray(`(${question.question_type})`),
          chalk.gray(`${question.haystack_sessions.length} sessions`),
          chalk.gray(`- ${completedCount}/${questionsToProcess.length}`),
        );
        mainSpinner.render();

        // Update progress
        updateProgress();
      }
    };

    // Set up periodic progress updates
    const progressInterval = setInterval(updateProgress, 500);

    // Create worker slots
    const workers = Array.from({ length: questionConcurrency }, (_, i) => processNextQuestion(i));

    // Wait for all workers to complete
    await Promise.all(workers);

    // Clear the interval
    clearInterval(progressInterval);

    // Final update
    updateProgress();

    mainSpinner.succeed(`Prepared ${processedCount} questions (${cachedCount} from cache)`);
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.gray(`Total time: ${totalTime}s (${Math.round((processedCount / totalTime) * 60)} q/min)`));

    console.log(chalk.green('\n✅ Data preparation complete!\n'));
    console.log(chalk.gray(`Prepared data saved to: ${this.baseDir}/${options.dataset}/${options.memoryConfig}/`));
  }

  private async processQuestion(
    question: LongMemEvalQuestion,
    options: PrepareOptions,
    model: any,
    memoryOptions: MemoryConfigOptions,
    parentSpinner: any,
    questionNumber: number,
    totalQuestions: number,
    isConcurrent: boolean = false,
    slotIndex?: number,
    activeQuestions?: Map<number, { questionId: string; status: string }>,
  ): Promise<void> {
    // Create fresh storage instances for this question
    const benchmarkStore = new BenchmarkStore();
    const benchmarkVectorStore = new BenchmarkVectorStore();

    // Initialize stores
    await benchmarkStore.init();

    // Create vector index if using semantic recall
    if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
      await benchmarkVectorStore.createIndex({
        indexName: 'messages',
        dimension: 1536, // text-embedding-3-small dimension
        metric: 'cosine',
      });
    }

    // Create memory with appropriate configuration
    const memory = new Memory({
      storage: benchmarkStore,
      vector:
        options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined'
          ? benchmarkVectorStore
          : undefined,
      embedder:
        options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined'
          ? openai.embedding('text-embedding-3-small')
          : undefined,
      options: memoryOptions.options,
    });
    const usesWorkingMemory = options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined';

    // Create agent with appropriate model
    const agent = new Agent({
      name: 'prep-agent',
      instructions: usesWorkingMemory
        ? `You are a helpful assistant. When processing conversation history, extract and save specific user information to your working memory using the available tools. Pay close attention to:
- Personal details: full name, previous names, education (degree, school), occupation, location
- Daily routines: commute duration/method, exercise locations/activities, shopping locations, regular activities
- Preferences: entertainment choices (plays, movies), music/playlist names, hobbies, dietary preferences
- Specific events: dates, locations, names of events attended
- Purchases and services: where items were bought, what was purchased, subscription services used
Focus on concrete, specific details rather than general information.`
        : 'Process and store conversation history',
      model: model,
      memory: memory,
    });

    // If you fail to retain working memory information when you make an update, it will cause data loss. Make sure you retain information, even if you don't see that information in the current conversation. If you receive information about a completely different person, do not overwrite the existing working memory. Please make a second copy below the existing one, add a helpful title describing that this section is about an additional person, and keep tracking both of them. Make sure you print out the working memory for all persons, if you only print one person it will delete working memory for other people as well! So always print out the full contents of working memory to update it, not partial updates. If the current conversation is completely different than what's in working memory, do not discard working memory by overwriting it, instead maintain the old information, as well as the new information. The old information may come from a different conversation with the user. Working memory data should only be removed when the stored information has become verifiably false.

    // Process all haystack sessions
    const resourceId = `resource_${question.question_id}`;

    // Sort sessions by date for chronological processing (important for working memory)
    const sessionsWithDates = question.haystack_sessions.map((session, index) => ({
      session,
      sessionId: question.haystack_session_ids[index],
      date: question.haystack_dates[index],
    }));

    // Sort by date (oldest first)
    sessionsWithDates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Debug: Log first and last dates to confirm sorting
    if (sessionsWithDates.length > 0 && !isConcurrent) {
      const firstDate = new Date(sessionsWithDates[0].date).toISOString().split('T')[0];
      const lastDate = new Date(sessionsWithDates[sessionsWithDates.length - 1].date).toISOString().split('T')[0];
      console.log(chalk.gray(`  Sessions sorted: ${firstDate} (oldest) → ${lastDate} (newest)`));
    }

    // Create output directory early to save progress
    const questionDir = join(
      options.outputDir || this.baseDir,
      options.dataset,
      options.memoryConfig,
      question.question_id,
    );
    await mkdir(questionDir, { recursive: true });

    // Check if this question has partial progress saved
    const progressFile = join(questionDir, 'progress.json');
    let processedSessionIds: Set<string> = new Set();

    // Always try to load existing db.json if it exists (for resume scenarios)
    const dbPath = join(questionDir, 'db.json');
    const vectorPath = join(questionDir, 'vector.json');

    if (existsSync(dbPath)) {
      console.log(chalk.gray('Loading existing database...'));
      await benchmarkStore.hydrate(dbPath);
    }

    if (existsSync(vectorPath) && (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined')) {
      console.log(chalk.gray('Loading existing vector store...'));
      await benchmarkVectorStore.hydrate(vectorPath);
    }

    if (existsSync(progressFile)) {
      try {
        const progress = JSON.parse(await readFile(progressFile, 'utf-8'));
        processedSessionIds = new Set(progress.processedSessionIds || []);

        if (isConcurrent && slotIndex !== undefined && activeQuestions) {
          activeQuestions.set(slotIndex, {
            questionId: question.question_id,
            status: `Resuming from session ${processedSessionIds.size}/${sessionsWithDates.length}`,
          });
        } else if (!isConcurrent) {
          parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Resuming from session ${processedSessionIds.size}/${sessionsWithDates.length}`;
          console.log(
            chalk.yellow(
              `\n📂 Resuming ${question.question_id} from session ${processedSessionIds.size}/${sessionsWithDates.length}`,
            ),
          );
        }
      } catch (e) {
        console.log(chalk.red(`Failed to load progress for ${question.question_id}:`));
        console.error(e);
        if (options.resumeFromMessageId) {
          console.log(chalk.red(`Cannot resume without valid progress data. Exiting.`));
          process.exit(1);
        }
        processedSessionIds = new Set();
      }
    }

    // If resuming from specific message ID, find the session that contains it
    // if (options.resumeFromMessageId) {
    //   console.log(chalk.yellow(`\n🔍 Looking for message ID: ${options.resumeFromMessageId}`));
    //
    //   // Read the db.json to find which session contains the message
    //   const dbPath = join(questionDir, 'db.json');
    //   if (existsSync(dbPath)) {
    //     const dbContent = JSON.parse(await readFile(dbPath, 'utf-8'));
    //     let foundMessageSession = false;
    //
    //     // Try both possible message array names
    //     const messages = dbContent.messages || dbContent.mastra_messages;
    //     console.log(chalk.gray(`Loaded db.json with ${messages?.length || 0} messages`));
    //
    //     // Search through all messages to find the one with our ID
    //     if (messages && Array.isArray(messages)) {
    //       let messageCount = 0;
    //       for (const messageEntry of messages) {
    //         messageCount++;
    //         if (messageEntry[0] === options.resumeFromMessageId) {
    //           const message = messageEntry[1];
    //           const sessionId = message.threadId;
    //           console.log(chalk.green(`✓ Found message in session: ${sessionId} (message #${messageCount})`));
    //
    //           // Clear processedSessionIds and add only sessions up to this one
    //           processedSessionIds.clear();
    //           let sessionsToRemove: string[] = [];
    //
    //           for (let i = 0; i < sessionsWithDates.length; i++) {
    //             if (sessionsWithDates[i].sessionId === sessionId) {
    //               // Add all sessions before and including this one as processed
    //               for (let j = 0; j <= i; j++) {
    //                 processedSessionIds.add(sessionsWithDates[j].sessionId);
    //               }
    //               // Collect sessions after this one to remove
    //               for (let k = i + 1; k < sessionsWithDates.length; k++) {
    //                 sessionsToRemove.push(sessionsWithDates[k].sessionId);
    //               }
    //               foundMessageSession = true;
    //               break;
    //             }
    //           }
    //
    //           // Remove messages from sessions that will be regenerated
    //           if (sessionsToRemove.length > 0) {
    //             console.log(
    //               chalk.yellow(
    //                 `\n🗑️  Removing messages from ${sessionsToRemove.length} sessions that will be regenerated...`,
    //               ),
    //             );
    //             await removeMessagesFromSessions(benchmarkStore, sessionsToRemove, questionDir);
    //           }
    //           break;
    //         }
    //       }
    //       console.log(chalk.gray(`Searched through ${messageCount} messages`));
    //     } else {
    //       console.log(chalk.red(`db.json does not contain a messages array`));
    //     }
    //
    //     if (!foundMessageSession) {
    //       console.log(chalk.red(`✗ Message ID ${options.resumeFromMessageId} not found in prepared data`));
    //       console.log(chalk.red(`Cannot resume from unknown message ID. Exiting.`));
    //       process.exit(1);
    //     }
    //   } else {
    //     console.log(chalk.red(`✗ No prepared data found at ${dbPath}`));
    //     console.log(chalk.red(`Cannot resume without existing data. Exiting.`));
    //     process.exit(1);
    //   }
    // }

    // Process sessions in batches to avoid overwhelming the system
    const BATCH_SIZE = usesWorkingMemory ? 1 : 50; // Process x sessions at a time. working memory must run one at a time since each conversation will use resource working memory from the last conversation and build on it.
    let processedSessions = processedSessionIds.size;

    // Apply session offset if specified
    if (options.sessionOffset && !options.resumeFromMessageId) {
      const offsetIndex = options.sessionOffset - 1; // Convert to 0-based index
      if (offsetIndex >= 0 && offsetIndex < sessionsWithDates.length) {
        console.log(
          chalk.yellow(`\n⏭️  Starting from session ${options.sessionOffset} (skipping first ${offsetIndex} sessions)`),
        );

        // Mark all sessions before the offset as processed
        for (let i = 0; i < offsetIndex; i++) {
          processedSessionIds.add(sessionsWithDates[i].sessionId);
        }
        processedSessions = processedSessionIds.size;
      } else {
        console.log(
          chalk.red(`✗ Session offset ${options.sessionOffset} is out of range (1-${sessionsWithDates.length})`),
        );
        process.exit(1);
      }
    }

    // Apply session limit if specified
    let sessionsToProcess = sessionsWithDates;
    if (options.sessionLimit) {
      const startIndex = processedSessionIds.size;
      const endIndex = Math.min(startIndex + options.sessionLimit, sessionsWithDates.length);
      sessionsToProcess = sessionsWithDates.slice(0, endIndex);
      console.log(
        chalk.yellow(`\n📊 Processing limited to ${options.sessionLimit} sessions (${startIndex + 1} to ${endIndex})`),
      );
    }

    // For working memory: Find and preserve the last working memory state before regeneration
    // if (usesWorkingMemory && processedSessionIds.size > 0) {
    //   console.log(chalk.yellow(`\n🔄 Finding last working memory state before regeneration...`));
    //   console.log(chalk.gray(`Searching through ${processedSessionIds.size} processed sessions`));
    //
    //   // Search through all processed messages to find the last updateWorkingMemory tool call
    //   let lastWorkingMemoryUpdate: string | null = null;
    //   let foundInSession: string | null = null;
    //
    //   // Get messages from all processed sessions
    //   const allMessages: any[] = [];
    //   let sessionsWithMessages = 0;
    //   for (const sessionId of processedSessionIds) {
    //     const sessionMessages = await benchmarkStore.getMessages({
    //       threadId: sessionId,
    //       format: 'v2'
    //     });
    //     if (sessionMessages.length > 0) {
    //       sessionsWithMessages++;
    //       allMessages.push(...sessionMessages);
    //     }
    //   }
    //   console.log(chalk.gray(`Found ${allMessages.length} messages from ${sessionsWithMessages} sessions`));
    //
    //   // Sort messages by createdAt descending to search from newest to oldest
    //   allMessages.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    //
    //   for (const message of allMessages) {
    //     // Check if this is an assistant message with tool calls (V2 format)
    //     if (message.content?.role === 'assistant' && message.content?.parts) {
    //       // Look for tool-invocation parts in V2 format
    //       const toolCalls = message.content.parts.filter(
    //         (p: any) => p.type === 'tool-invocation' && p.toolInvocation?.toolName === 'updateWorkingMemory'
    //       );
    //
    //       if (toolCalls && toolCalls.length > 0) {
    //         // Extract the working memory from the tool call arguments
    //         const toolCall = toolCalls[0];
    //         const workingMemoryArg = toolCall.toolInvocation?.args?.workingMemory;
    //
    //         if (workingMemoryArg) {
    //           lastWorkingMemoryUpdate = workingMemoryArg;
    //           foundInSession = message.threadId;
    //           break; // Found the most recent update
    //         }
    //       }
    //     }
    //   }
    //
    //   if (lastWorkingMemoryUpdate && foundInSession) {
    //     console.log(chalk.cyan(`📋 Found last working memory update from session ${foundInSession}`));
    //     console.log(chalk.gray(`Working memory length: ${lastWorkingMemoryUpdate.length} characters`));
    //
    //     // Update the resource with this working memory state
    //     await memory.updateWorkingMemory({
    //       threadId: foundInSession,
    //       resourceId,
    //       workingMemory: lastWorkingMemoryUpdate,
    //       memoryConfig: memoryOptions.options,
    //     });
    //
    //     console.log(chalk.green(`✓ Updated resource with last working memory state`));
    //   } else {
    //     console.log(chalk.yellow(`⚠️  No working memory updates found in processed sessions`));
    //   }
    // }

    // For debugging working memory
    if (usesWorkingMemory && processedSessions === 0 && !isConcurrent) {
      console.log(chalk.yellow(`\n🧠 Working memory enabled for question ${question.question_id}`));
      console.log(chalk.gray(`Resource ID: ${resourceId}`));
      console.log(chalk.gray(`Processing ${sessionsToProcess.length} sessions in chronological order`));
    }

    for (let i = 0; i < sessionsToProcess.length; i += BATCH_SIZE) {
      const sessionBatch = sessionsToProcess.slice(i, i + BATCH_SIZE);

      // Update progress
      if (isConcurrent && slotIndex !== undefined && activeQuestions) {
        // Calculate current session index (1-based)
        const currentSessionIndex = processedSessions + 1;
        // Update active questions status
        activeQuestions.set(slotIndex, {
          questionId: question.question_id,
          status: `Processing session ${currentSessionIndex} (${processedSessions}/${sessionsToProcess.length} total)`,
        });
      } else if (!isConcurrent) {
        const currentSessionIndex = processedSessions + 1;
        parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Processing session ${currentSessionIndex} (${processedSessions}/${sessionsToProcess.length} total)`;
      }

      // Process batch in parallel
      const batchPromises = sessionBatch.map(async ({ session, sessionId, date }) => {
        // Skip if already processed
        if (processedSessionIds.has(sessionId)) {
          return;
        }

        // Convert session to messages
        const messages: CoreMessage[] = [];
        for (const turn of session) {
          if (!turn.content) continue;

          const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : 'user';
          messages.push({
            role,
            content: turn.content,
          });
        }

        if (messages.length > 0) {
          // if (usesWorkingMemory) {
          //   // Clear spinner before console output
          //   if (!isConcurrent) parentSpinner.clear();
          //   console.log(
          //     chalk.yellow(
          //       `\nexisting working memory\n${await memory.getWorkingMemory({ threadId: sessionId, resourceId, memoryConfig: memoryOptions.options })}\n`,
          //     ),
          //   );
          //   if (!isConcurrent) parentSpinner.render();
          // }
          // Process through agent to save to memory
          const result = await agent.generate(messages, {
            threadId: sessionId, // Use haystack session ID as thread ID
            resourceId,
            memoryOptions: memoryOptions.options,
          });
          // if (usesWorkingMemory) {
          //   // Clear spinner before console output
          //   if (!isConcurrent) parentSpinner.clear();
          //   console.log(`\n\nsent instruction`, chalk.red(JSON.parse(result.request.body!).messages[1].content), `\n`);
          //   // console.log(JSON.stringify(result.request.body, null, 2));
          //   // Check if working memory was updated
          //   const hasWorkingMemoryUpdate = result.response.messages.some((msg: any) =>
          //     msg.content?.some?.((c: any) => c.toolName === 'updateWorkingMemory'),
          //   );
          //
          //   // console.log(memoryOptions.options);
          //   if (hasWorkingMemoryUpdate) {
          //     // Get the current working memory state
          //     const currentWorkingMemory = await memory.getWorkingMemory({
          //       threadId: sessionId,
          //       resourceId,
          //       memoryConfig: memoryOptions.options,
          //     });
          //     console.log(chalk.cyan(`\n📝 Working memory after session ${sessionId}:`));
          //     console.log(chalk.blue(currentWorkingMemory));
          //     console.log(chalk.blue(`working memory was updated.`));
          //   }
          //   if (!isConcurrent) parentSpinner.render();
          // }
        }

        // Mark as processed
        processedSessionIds.add(sessionId);

        // Save progress after each session if using working memory
        if (usesWorkingMemory) {
          await writeFile(
            progressFile,
            JSON.stringify({
              processedSessionIds: Array.from(processedSessionIds),
              lastSavedDb: 'db.json',
              lastSavedVector: 'vector.json',
            }),
          );

          // Persist current state
          await benchmarkStore.persist(join(questionDir, 'db.json'));
          if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
            await benchmarkVectorStore.persist(join(questionDir, 'vector.json'));
          }
        }
      });

      await Promise.all(batchPromises);

      // Update processed count based on actual processed sessions
      processedSessions = processedSessionIds.size;

      // Update progress after batch completes
      if (isConcurrent && slotIndex !== undefined && activeQuestions) {
        // Calculate current session index (1-based)
        const currentSessionIndex = processedSessions + 1;
        activeQuestions.set(slotIndex, {
          questionId: question.question_id,
          status: `Processing session ${currentSessionIndex} (${processedSessions}/${sessionsToProcess.length} total)`,
        });
      } else if (!isConcurrent) {
        const currentSessionIndex = processedSessions + 1;
        parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Processing session ${currentSessionIndex} (${processedSessions}/${sessionsToProcess.length} total)`;
      }
    }

    // Update status to saving
    if (isConcurrent && slotIndex !== undefined && activeQuestions) {
      activeQuestions.set(slotIndex, {
        questionId: question.question_id,
        status: 'Saving data...',
      });
    } else if (!isConcurrent) {
      parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Saving data...`;
    }

    // Persist storage
    await benchmarkStore.persist(join(questionDir, 'db.json'));

    // Persist vector store if used
    if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
      await benchmarkVectorStore.persist(join(questionDir, 'vector.json'));
    }

    // Save metadata
    const metadata = {
      questionId: question.question_id,
      questionType: question.question_type,
      question: question.question,
      answer: question.answer,
      resourceId,
      threadIds: question.haystack_session_ids,
      preparedAt: new Date().toISOString(),
      memoryConfig: options.memoryConfig,
      sessionCount: sessionsWithDates.length,
      evidenceSessionIds: question.answer_session_ids,
      note: 'Sessions were processed in chronological order (oldest first) for working memory',
    };

    await writeFile(join(questionDir, 'meta.json'), JSON.stringify(metadata, null, 2));

    // Clean up progress file after successful completion
    if (existsSync(progressFile)) {
      await writeFile(
        progressFile,
        JSON.stringify({
          processedSessionIds: Array.from(processedSessionIds),
          completed: true,
          completedAt: new Date().toISOString(),
        }),
      );
    }
  }

  private getMemoryOptions(memoryConfig: string): MemoryConfigOptions {
    switch (memoryConfig) {
      case 'full-history':
        return {
          type: 'full-history',
          options: {
            lastMessages: 999999,
            semanticRecall: false,
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'last-k':
        return {
          type: 'last-k',
          options: {
            lastMessages: 50,
            semanticRecall: false,
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'semantic-recall':
        return {
          type: 'semantic-recall',
          options: {
            lastMessages: 10,
            semanticRecall: {
              topK: 10,
              messageRange: 2,
              scope: 'resource',
            },
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'working-memory':
        return {
          type: 'working-memory',
          options: {
            lastMessages: 10,
            semanticRecall: false,
            workingMemory: {
              enabled: true,
              scope: 'resource',
              template: `# User Context
## Personal Information
- **Name**: 
- **Previous Names**: 
- **Education**: 
- **Occupation**: 
- **Location**: 

## Daily Life & Activities
- **Commute**: 
- **Exercise/Fitness**: 
- **Shopping Habits**: 
- **Regular Activities**: 

## Preferences & Interests
- **Entertainment**: 
- **Music/Playlists**: 
- **Hobbies**: 
- **Food/Dietary**: 

## Events & Experiences
- **Recent Events**: 
- **Travel**: 
- **Cultural Activities**: 

## Purchases & Services
- **Recent Purchases**: 
- **Subscriptions**: 
- **Frequently Used Services**: 

## Working memory update reasons
- 
- `,
            },
          },
        };

      case 'combined':
        return {
          type: 'combined',
          options: {
            lastMessages: 10,
            semanticRecall: {
              topK: 10,
              messageRange: 5,
              scope: 'resource',
            },
            workingMemory: {
              enabled: true,
              scope: 'resource',
              template: `# User Context
## Personal Information
- **Name**: 
- **Previous Names**: 
- **Education**: 
- **Occupation**: 
- **Location**: 

## Daily Life & Activities
- **Commute**: 
- **Exercise/Fitness**: 
- **Shopping Habits**: 
- **Regular Activities**: 

## Preferences & Interests
- **Entertainment**: 
- **Music/Playlists**: 
- **Hobbies**: 
- **Food/Dietary**: 

## Events & Experiences
- **Recent Events**: 
- **Travel**: 
- **Cultural Activities**: 

## Purchases & Services
- **Recent Purchases**: 
- **Subscriptions**: 
- **Frequently Used Services**: 

## Working memory update reasons
- 
-
`,
            },
          },
        };

      default:
        throw new Error(`Unknown memory config: ${memoryConfig}`);
    }
  }
}
