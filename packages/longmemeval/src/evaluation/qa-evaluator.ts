import { OpenAI } from 'openai';
import type { 
  LongMemEvalQuestion, 
  QuestionType, 
  EvaluationResult 
} from '../data/types';

export interface EvaluatorConfig {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  maxRetries?: number;
}

export class QAEvaluator {
  private client: OpenAI;
  private model: string;

  constructor(config: EvaluatorConfig = {}) {
    this.model = config.model || 'gpt-4o-2024-08-06';
    
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseURL,
    });
  }

  /**
   * Evaluate a single question-answer pair
   */
  async evaluateAnswer(
    question: LongMemEvalQuestion,
    hypothesis: string
  ): Promise<EvaluationResult> {
    const isAbstention = question.question_id.endsWith('_abs');
    const prompt = this.getEvalPrompt(
      question.question_type,
      question.question,
      question.answer,
      hypothesis,
      isAbstention
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      const responseText = response.choices[0]?.message?.content?.toLowerCase().trim();
      const isCorrect = responseText === 'yes';

      return {
        question_id: question.question_id,
        hypothesis,
        autoeval_label: isCorrect,
        question_type: question.question_type,
        is_correct: isCorrect,
      };
    } catch (error) {
      console.error(`Error evaluating question ${question.question_id}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a batch of answers
   */
  async evaluateBatch(
    questions: LongMemEvalQuestion[],
    hypotheses: Map<string, string>
  ): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    for (const question of questions) {
      const hypothesis = hypotheses.get(question.question_id);
      if (!hypothesis) {
        console.warn(`No hypothesis found for question ${question.question_id}`);
        continue;
      }

      const result = await this.evaluateAnswer(question, hypothesis);
      results.push(result);
    }

    return results;
  }

  /**
   * Get the evaluation prompt based on question type
   */
  private getEvalPrompt(
    taskType: QuestionType,
    question: string,
    answer: string,
    response: string,
    isAbstention: boolean
  ): string {
    if (isAbstention) {
      return `I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.

Question: ${question}

Explanation: ${answer}

Model Response: ${response}

Does the model correctly identify the question as unanswerable? Answer yes or no only.`;
    }

    switch (taskType) {
      case 'single-session-user':
      case 'single-session-assistant':
      case 'multi-session':
        return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no.

Question: ${question}

Correct Answer: ${answer}

Model Response: ${response}

Is the model response correct? Answer yes or no only.`;

      case 'temporal-reasoning':
        return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct.

Question: ${question}

Correct Answer: ${answer}

Model Response: ${response}

Is the model response correct? Answer yes or no only.`;

      case 'knowledge-update':
        return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.

Question: ${question}

Correct Answer: ${answer}

Model Response: ${response}

Is the model response correct? Answer yes or no only.`;

      case 'single-session-preference':
        return `I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.

Question: ${question}

Rubric: ${answer}

Model Response: ${response}

Is the model response correct? Answer yes or no only.`;

      default:
        throw new Error(`Unknown question type: ${taskType}`);
    }
  }

  /**
   * Calculate metrics from evaluation results
   */
  calculateMetrics(results: EvaluationResult[]) {
    const metrics = {
      overall_accuracy: 0,
      accuracy_by_type: {} as Record<QuestionType, { correct: number; total: number; accuracy: number }>,
      abstention_accuracy: 0,
      total_questions: results.length,
      correct_answers: 0,
      abstention_correct: 0,
      abstention_total: 0,
    };

    // Calculate overall metrics
    for (const result of results) {
      if (result.is_correct) {
        metrics.correct_answers++;
      }

      // Track by question type
      const type = result.question_type!;
      if (!metrics.accuracy_by_type[type]) {
        metrics.accuracy_by_type[type] = { correct: 0, total: 0, accuracy: 0 };
      }
      metrics.accuracy_by_type[type].total++;
      if (result.is_correct) {
        metrics.accuracy_by_type[type].correct++;
      }

      // Track abstention separately
      if (result.question_id.endsWith('_abs')) {
        metrics.abstention_total++;
        if (result.is_correct) {
          metrics.abstention_correct++;
        }
      }
    }

    // Calculate accuracies
    metrics.overall_accuracy = metrics.correct_answers / metrics.total_questions;
    
    for (const type in metrics.accuracy_by_type) {
      const typeMetrics = metrics.accuracy_by_type[type as QuestionType];
      typeMetrics.accuracy = typeMetrics.correct / typeMetrics.total;
    }

    if (metrics.abstention_total > 0) {
      metrics.abstention_accuracy = metrics.abstention_correct / metrics.abstention_total;
    }

    return metrics;
  }
}