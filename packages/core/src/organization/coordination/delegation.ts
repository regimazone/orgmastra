import { randomUUID } from 'crypto';
import type { IMastraLogger } from '../../logger';
import type {
  DelegationRequest,
  CoordinationResult,
  FederationConfig,
} from '../types';

/**
 * Represents a delegation task in the system
 */
export interface DelegationTask {
  id: string;
  request: DelegationRequest;
  assignedTo?: string;
  status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  result?: CoordinationResult;
  createdAt: Date;
  assignedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  delegationChain: string[];
}

/**
 * Configuration for the delegation manager
 */
export interface DelegationManagerConfig {
  /** Maximum number of tasks that can be delegated simultaneously */
  maxConcurrentTasks: number;
  /** Timeout for task completion in milliseconds */
  taskTimeout: number;
  /** Whether to enable automatic retry on task failures */
  enableRetry: boolean;
  /** Maximum number of retries per task */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
  /** Strategy for selecting delegates */
  selectionStrategy: 'round-robin' | 'capability-based' | 'load-balanced' | 'priority-based';
}

/**
 * Statistics about delegation performance
 */
export interface DelegationStatistics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  averageCompletionTime: number;
  successRate: number;
  delegationChainStats: {
    averageDepth: number;
    maxDepth: number;
    commonPatterns: Array<{ pattern: string[]; count: number }>;
  };
}

/**
 * Manages task delegation within the federated organization system
 */
export class DelegationManager {
  #tasks: Map<string, DelegationTask>;
  #config: DelegationManagerConfig;
  #logger?: IMastraLogger;
  #selectionIndex: number; // For round-robin selection

  constructor(config?: Partial<DelegationManagerConfig>, logger?: IMastraLogger) {
    this.#tasks = new Map();
    this.#logger = logger;
    this.#selectionIndex = 0;

    this.#config = {
      maxConcurrentTasks: 100,
      taskTimeout: 300000, // 5 minutes
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 10000, // 10 seconds
      selectionStrategy: 'capability-based',
      ...config,
    };

    // Set up periodic cleanup
    setInterval(() => {
      this.#cleanupExpiredTasks();
    }, 60000); // Check every minute
  }

  /**
   * Create a new delegation task
   */
  public createTask(request: DelegationRequest): string {
    const taskId = randomUUID();
    
    const task: DelegationTask = {
      id: taskId,
      request,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
      delegationChain: [request.initiatorId],
    };

    // Check if we've reached the maximum concurrent tasks
    const activeTasks = Array.from(this.#tasks.values()).filter(t => 
      t.status === 'pending' || t.status === 'assigned' || t.status === 'in-progress'
    );

    if (activeTasks.length >= this.#config.maxConcurrentTasks) {
      this.#logger?.warn('Maximum concurrent tasks reached, queuing task', {
        taskId,
        activeTaskCount: activeTasks.length,
        maxConcurrent: this.#config.maxConcurrentTasks,
      });
      // Task remains in 'pending' status and will be processed when capacity is available
    }

    this.#tasks.set(taskId, task);
    
    this.#logger?.info('Delegation task created', {
      taskId,
      initiator: request.initiatorId,
      priority: request.priority,
    });

    return taskId;
  }

  /**
   * Assign a task to a specific delegate
   */
  public assignTask(taskId: string, delegateId: string): boolean {
    const task = this.#tasks.get(taskId);
    
    if (!task) {
      this.#logger?.warn('Attempted to assign non-existent task', { taskId, delegateId });
      return false;
    }

    if (task.status !== 'pending') {
      this.#logger?.warn('Attempted to assign task that is not pending', {
        taskId,
        delegateId,
        currentStatus: task.status,
      });
      return false;
    }

    task.assignedTo = delegateId;
    task.status = 'assigned';
    task.assignedAt = new Date();
    task.delegationChain.push(delegateId);

    this.#logger?.info('Task assigned to delegate', {
      taskId,
      delegateId,
      delegationChain: task.delegationChain,
    });

    return true;
  }

  /**
   * Mark a task as in progress
   */
  public startTask(taskId: string): boolean {
    const task = this.#tasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.status !== 'assigned') {
      this.#logger?.warn('Attempted to start task that is not assigned', {
        taskId,
        currentStatus: task.status,
      });
      return false;
    }

    task.status = 'in-progress';
    
    this.#logger?.info('Task started', { taskId, assignedTo: task.assignedTo });

    return true;
  }

  /**
   * Complete a task with a result
   */
  public completeTask(taskId: string, result: CoordinationResult): boolean {
    const task = this.#tasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.status !== 'in-progress' && task.status !== 'assigned') {
      this.#logger?.warn('Attempted to complete task with invalid status', {
        taskId,
        currentStatus: task.status,
      });
      return false;
    }

    task.status = result.success ? 'completed' : 'failed';
    task.result = result;
    task.completedAt = new Date();

    this.#logger?.info('Task completed', {
      taskId,
      success: result.success,
      duration: task.completedAt.getTime() - task.createdAt.getTime(),
      delegationChain: task.delegationChain,
    });

    // If the task failed and retry is enabled, schedule a retry
    if (!result.success && this.#config.enableRetry && task.retryCount < this.#config.maxRetries) {
      this.#scheduleRetry(taskId);
    }

    return true;
  }

  /**
   * Cancel a task
   */
  public cancelTask(taskId: string, reason?: string): boolean {
    const task = this.#tasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      return false;
    }

    task.status = 'cancelled';
    task.result = {
      success: false,
      error: {
        code: 'TASK_CANCELLED',
        message: reason || 'Task was cancelled',
      },
    };

    this.#logger?.info('Task cancelled', { taskId, reason });

    return true;
  }

  /**
   * Get a task by ID
   */
  public getTask(taskId: string): DelegationTask | undefined {
    return this.#tasks.get(taskId);
  }

  /**
   * Get tasks by status
   */
  public getTasksByStatus(status: DelegationTask['status']): DelegationTask[] {
    return Array.from(this.#tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get tasks assigned to a specific delegate
   */
  public getTasksByDelegate(delegateId: string): DelegationTask[] {
    return Array.from(this.#tasks.values()).filter(task => task.assignedTo === delegateId);
  }

  /**
   * Select the best delegate for a task based on configuration strategy
   */
  public selectDelegate(
    task: DelegationTask,
    availableDelegates: Array<{
      id: string;
      capabilities: string[];
      currentLoad: number;
      federationConfig: FederationConfig;
    }>
  ): string | undefined {
    if (availableDelegates.length === 0) {
      return undefined;
    }

    // Filter delegates based on federation config and capabilities
    const eligibleDelegates = availableDelegates.filter(delegate => {
      // Check if delegate can receive delegations
      if (!delegate.federationConfig.canReceiveDelegation) {
        return false;
      }

      // Check delegation depth
      const chainDepth = task.delegationChain.length + 1;
      if (chainDepth > delegate.federationConfig.maxDelegationDepth) {
        return false;
      }

      // Check if delegate is in the trust list (if specified)
      if (delegate.federationConfig.trustedDelegates.length > 0) {
        const initiator = task.request.initiatorId;
        if (!delegate.federationConfig.trustedDelegates.includes(initiator)) {
          return false;
        }
      }

      // Check capabilities if required
      const requiredCapabilities = task.request.payload.requiredCapabilities || [];
      if (requiredCapabilities.length > 0) {
        return requiredCapabilities.every(capability => 
          delegate.capabilities.includes(capability)
        );
      }

      return true;
    });

    if (eligibleDelegates.length === 0) {
      return undefined;
    }

    // Select based on strategy
    switch (this.#config.selectionStrategy) {
      case 'round-robin':
        return this.#selectRoundRobin(eligibleDelegates);
      
      case 'capability-based':
        return this.#selectCapabilityBased(task, eligibleDelegates);
      
      case 'load-balanced':
        return this.#selectLoadBalanced(eligibleDelegates);
      
      case 'priority-based':
        return this.#selectPriorityBased(task, eligibleDelegates);
      
      default:
        // For now, just return the first delegate as a placeholder
        return eligibleDelegates.length > 0 ? eligibleDelegates[0]?.id : undefined;
    }
  }

  /**
   * Get delegation statistics
   */
  public getStatistics(): DelegationStatistics {
    const allTasks = Array.from(this.#tasks.values());
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const failedTasks = allTasks.filter(t => t.status === 'failed');
    const pendingTasks = allTasks.filter(t => 
      t.status === 'pending' || t.status === 'assigned' || t.status === 'in-progress'
    );

    // Calculate average completion time
    const completionTimes = completedTasks
      .filter(t => t.completedAt)
      .map(t => t.completedAt!.getTime() - t.createdAt.getTime());
    
    const averageCompletionTime = completionTimes.length > 0 
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : 0;

    // Calculate delegation chain statistics
    const chains = allTasks.map(t => t.delegationChain);
    const depths = chains.map(chain => chain.length);
    const averageDepth = depths.length > 0 
      ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length
      : 0;
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

    // Find common delegation patterns
    const chainPatterns = new Map<string, number>();
    chains.forEach(chain => {
      const pattern = chain.join(' -> ');
      chainPatterns.set(pattern, (chainPatterns.get(pattern) || 0) + 1);
    });

    const commonPatterns = Array.from(chainPatterns.entries())
      .map(([pattern, count]) => ({ pattern: pattern.split(' -> '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 patterns

    return {
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      pendingTasks: pendingTasks.length,
      averageCompletionTime,
      successRate: allTasks.length > 0 
        ? completedTasks.length / (completedTasks.length + failedTasks.length)
        : 0,
      delegationChainStats: {
        averageDepth,
        maxDepth,
        commonPatterns,
      },
    };
  }

  /**
   * Clean up expired or old tasks
   */
  #cleanupExpiredTasks(): void {
    const now = Date.now();
    const expiredTasks: string[] = [];

    for (const [taskId, task] of this.#tasks) {
      // Clean up completed/failed tasks older than 1 hour
      if ((task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
        const completedTime = task.completedAt?.getTime() || task.createdAt.getTime();
        if (now - completedTime > 3600000) { // 1 hour
          expiredTasks.push(taskId);
        }
      }
      
      // Clean up tasks that have exceeded timeout
      if ((task.status === 'in-progress' || task.status === 'assigned')) {
        const startTime = task.assignedAt?.getTime() || task.createdAt.getTime();
        if (now - startTime > this.#config.taskTimeout) {
          this.cancelTask(taskId, 'Task timeout exceeded');
        }
      }
    }

    // Remove expired tasks
    for (const taskId of expiredTasks) {
      this.#tasks.delete(taskId);
    }

    if (expiredTasks.length > 0) {
      this.#logger?.info('Cleaned up expired delegation tasks', {
        cleanedUpCount: expiredTasks.length,
        remainingTasks: this.#tasks.size,
      });
    }
  }

  /**
   * Schedule a retry for a failed task
   */
  #scheduleRetry(taskId: string): void {
    const task = this.#tasks.get(taskId);
    if (!task) return;

    task.retryCount++;
    task.status = 'pending';
    task.assignedTo = undefined;
    task.assignedAt = undefined;

    this.#logger?.info('Scheduling task retry', {
      taskId,
      retryCount: task.retryCount,
      maxRetries: this.#config.maxRetries,
    });

    setTimeout(() => {
      // Task will be picked up by the normal assignment process
    }, this.#config.retryDelay);
  }

  /**
   * Round-robin delegate selection
   */
  #selectRoundRobin(delegates: Array<{ id: string; [key: string]: any }>): string | undefined {
    if (delegates.length === 0) return undefined;
    const selected = delegates[this.#selectionIndex % delegates.length];
    this.#selectionIndex++;
    return selected?.id;
  }

  /**
   * Capability-based delegate selection
   */
  #selectCapabilityBased(
    task: DelegationTask,
    delegates: Array<{ id: string; capabilities: string[]; [key: string]: any }>
  ): string | undefined {
    if (delegates.length === 0) return undefined;
    
    const requiredCapabilities = task.request.payload.requiredCapabilities || [];
    
    if (requiredCapabilities.length === 0) {
      return delegates[0]?.id;
    }

    // Score delegates based on how many required capabilities they have
    const scoredDelegates = delegates.map(delegate => {
      const matchingCapabilities = requiredCapabilities.filter(cap => 
        delegate.capabilities.includes(cap)
      );
      return {
        ...delegate,
        score: matchingCapabilities.length,
      };
    });

    // Sort by score (highest first)
    scoredDelegates.sort((a, b) => b.score - a.score);
    
    return scoredDelegates.length > 0 ? scoredDelegates[0]?.id : undefined;
  }

  /**
   * Load-balanced delegate selection
   */
  #selectLoadBalanced(delegates: Array<{ id: string; currentLoad: number; [key: string]: any }>): string | undefined {
    if (delegates.length === 0) return undefined;
    // Select delegate with lowest current load
    const sortedByLoad = [...delegates].sort((a, b) => a.currentLoad - b.currentLoad);
    return sortedByLoad[0]?.id;
  }

  /**
   * Priority-based delegate selection
   */
  #selectPriorityBased(
    task: DelegationTask,
    delegates: Array<{ id: string; [key: string]: any }>
  ): string | undefined {
    if (delegates.length === 0) return undefined;
    // For high priority tasks, prefer delegates that have been successful recently
    // For now, just return the first delegate as a placeholder
    return delegates[0]?.id;
  }
}