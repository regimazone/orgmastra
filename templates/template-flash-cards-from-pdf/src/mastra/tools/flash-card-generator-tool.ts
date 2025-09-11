import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const flashCardSchema = z.object({
  question: z.string().describe('The question or prompt for the flash card'),
  answer: z.string().describe('The answer or explanation'),
  questionType: z.enum([
    'definition',
    'concept',
    'application',
    'comparison',
    'true-false',
    'multiple-choice',
    'short-answer',
  ]),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  category: z.string().describe('Subject category or topic area'),
  tags: z.array(z.string()).describe('Related keywords and tags'),
  hint: z.string().optional().describe('Optional hint for difficult questions'),
  explanation: z.string().optional().describe('Additional explanation or context'),
});

export const flashCardGeneratorTool = createTool({
  id: 'flash-card-generator',
  description: 'Generates educational flash cards with questions and answers from analyzed content',
  inputSchema: z.object({
    concepts: z.array(
      z.object({
        concept: z.string(),
        explanation: z.string(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
        keywords: z.array(z.string()),
      }),
    ),
    definitions: z.array(
      z.object({
        term: z.string(),
        definition: z.string(),
        context: z.string().optional(),
      }),
    ),
    facts: z.array(
      z.object({
        fact: z.string(),
        category: z.string(),
        context: z.string().optional(),
      }),
    ),
    numberOfCards: z.number().min(1).max(50).default(10).describe('Number of flash cards to generate'),
    difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('intermediate'),
    questionTypes: z.array(z.enum([
      'definition',
      'concept', 
      'application',
      'comparison',
      'true-false',
      'multiple-choice',
      'short-answer',
    ])).optional().describe('Preferred question types'),
    subjectArea: z.string().describe('Subject area for the flash cards'),
  }),
  outputSchema: z.object({
    flashCards: z.array(flashCardSchema),
    metadata: z.object({
      totalCards: z.number(),
      cardsByDifficulty: z.object({
        beginner: z.number(),
        intermediate: z.number(),
        advanced: z.number(),
      }),
      cardsByType: z.record(z.number()),
      subjectArea: z.string(),
      generatedAt: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const {
      concepts,
      definitions,
      facts,
      numberOfCards,
      difficultyLevel,
      questionTypes = ['definition', 'concept', 'application'],
      subjectArea,
    } = context;

    console.log(`🃏 Generating ${numberOfCards} flash cards for ${subjectArea}...`);

    try {
      const flashCards: any[] = [];
      let cardCount = 0;
      const maxCardsPerType = Math.ceil(numberOfCards / questionTypes.length);

      // Helper function to add a card
      const addCard = (card: any) => {
        if (cardCount < numberOfCards) {
          flashCards.push(card);
          cardCount++;
        }
      };

      // Generate definition cards
      if (questionTypes.includes('definition') && definitions.length > 0) {
        const definitionCards = Math.min(definitions.length, maxCardsPerType);
        for (let i = 0; i < definitionCards && cardCount < numberOfCards; i++) {
          const def = definitions[i];
          addCard({
            question: `What is ${def.term}?`,
            answer: def.definition,
            questionType: 'definition',
            difficulty: difficultyLevel,
            category: subjectArea,
            tags: [def.term, subjectArea, 'definition'],
            hint: `Think about the meaning of ${def.term} in the context of ${subjectArea}`,
            explanation: def.context,
          });
        }
      }

      // Generate concept cards
      if (questionTypes.includes('concept') && concepts.length > 0) {
        const conceptCards = Math.min(concepts.length, maxCardsPerType);
        for (let i = 0; i < conceptCards && cardCount < numberOfCards; i++) {
          const concept = concepts[i];
          addCard({
            question: `Explain the concept of ${concept.concept}`,
            answer: concept.explanation,
            questionType: 'concept',
            difficulty: concept.difficulty || difficultyLevel,
            category: subjectArea,
            tags: [...concept.keywords, subjectArea, 'concept'],
            hint: `Consider the key aspects of ${concept.concept}`,
            explanation: undefined,
          });
        }
      }

      // Generate application cards
      if (questionTypes.includes('application') && concepts.length > 0) {
        const applicationCards = Math.min(concepts.length, maxCardsPerType);
        for (let i = 0; i < applicationCards && cardCount < numberOfCards; i++) {
          const concept = concepts[i];
          addCard({
            question: `How would you apply ${concept.concept} in practice?`,
            answer: `${concept.concept} can be applied by: ${concept.explanation}. This is particularly useful in ${subjectArea} contexts.`,
            questionType: 'application',
            difficulty: 'intermediate',
            category: subjectArea,
            tags: [...concept.keywords, subjectArea, 'application'],
            hint: `Think about real-world scenarios where ${concept.concept} would be useful`,
            explanation: undefined,
          });
        }
      }

      // Generate comparison cards
      if (questionTypes.includes('comparison') && concepts.length > 1) {
        const comparisonCards = Math.min(Math.floor(concepts.length / 2), maxCardsPerType);
        for (let i = 0; i < comparisonCards && cardCount < numberOfCards; i++) {
          const concept1 = concepts[i * 2];
          const concept2 = concepts[i * 2 + 1];
          if (concept1 && concept2) {
            addCard({
              question: `Compare and contrast ${concept1.concept} with ${concept2.concept}`,
              answer: `${concept1.concept}: ${concept1.explanation}\n\n${concept2.concept}: ${concept2.explanation}\n\nKey differences lie in their specific applications and contexts within ${subjectArea}.`,
              questionType: 'comparison',
              difficulty: 'advanced',
              category: subjectArea,
              tags: [...concept1.keywords, ...concept2.keywords, subjectArea, 'comparison'],
              hint: `Consider the similarities and differences between these two concepts`,
              explanation: undefined,
            });
          }
        }
      }

      // Generate true/false cards from facts
      if (questionTypes.includes('true-false') && facts.length > 0) {
        const trueFalseCards = Math.min(facts.length, maxCardsPerType);
        for (let i = 0; i < trueFalseCards && cardCount < numberOfCards; i++) {
          const fact = facts[i];
          const isTrue = Math.random() > 0.5;
          const statement = isTrue ? fact.fact : `${fact.fact} (This is incorrect)`;

          addCard({
            question: `True or False: ${statement}`,
            answer: isTrue ? 'True' : 'False',
            questionType: 'true-false',
            difficulty: 'beginner',
            category: subjectArea,
            tags: [fact.category, subjectArea, 'true-false'],
            hint: `Consider what you know about ${fact.category}`,
            explanation: fact.context || `This relates to ${fact.category} in ${subjectArea}`,
          });
        }
      }

      // Generate short answer cards from facts
      if (questionTypes.includes('short-answer') && facts.length > 0) {
        const shortAnswerCards = Math.min(facts.length, maxCardsPerType);
        for (let i = 0; i < shortAnswerCards && cardCount < numberOfCards; i++) {
          const fact = facts[i];
          addCard({
            question: `Briefly explain: ${fact.fact}`,
            answer: `${fact.fact}${fact.context ? `. ${fact.context}` : ''}`,
            questionType: 'short-answer',
            difficulty: difficultyLevel,
            category: subjectArea,
            tags: [fact.category, subjectArea, 'short-answer'],
            hint: `Think about the key points related to ${fact.category}`,
            explanation: undefined,
          });
        }
      }

      // Fill remaining cards with mixed types if needed
      while (cardCount < numberOfCards) {
        if (definitions.length > flashCards.filter(c => c.questionType === 'definition').length) {
          const unusedDef = definitions.find(d => !flashCards.some(card => card.question.includes(d.term)));
          if (unusedDef) {
            addCard({
              question: `Define: ${unusedDef.term}`,
              answer: unusedDef.definition,
              questionType: 'definition',
              difficulty: difficultyLevel,
              category: subjectArea,
              tags: [unusedDef.term, subjectArea],
              hint: undefined,
              explanation: unusedDef.context,
            });
          } else {
            break;
          }
        } else if (concepts.length > flashCards.filter(c => c.questionType === 'concept').length) {
          const unusedConcept = concepts.find(c => !flashCards.some(card => card.question.includes(c.concept)));
          if (unusedConcept) {
            addCard({
              question: `What is the significance of ${unusedConcept.concept}?`,
              answer: unusedConcept.explanation,
              questionType: 'concept',
              difficulty: unusedConcept.difficulty || difficultyLevel,
              category: subjectArea,
              tags: [...unusedConcept.keywords, subjectArea],
              hint: undefined,
              explanation: undefined,
            });
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Calculate metadata
      const cardsByDifficulty = {
        beginner: flashCards.filter((card: any) => card.difficulty === 'beginner').length,
        intermediate: flashCards.filter((card: any) => card.difficulty === 'intermediate').length,
        advanced: flashCards.filter((card: any) => card.difficulty === 'advanced').length,
      };

      const cardsByType: Record<string, number> = {};
      flashCards.forEach((card: any) => {
        cardsByType[card.questionType] = (cardsByType[card.questionType] || 0) + 1;
      });

      const metadata = {
        totalCards: flashCards.length,
        cardsByDifficulty,
        cardsByType,
        subjectArea,
        generatedAt: new Date().toISOString(),
      };

      console.log(`✅ Generated ${flashCards.length} flash cards successfully`);
      console.log(
        `📊 Distribution: ${cardsByDifficulty.beginner} beginner, ${cardsByDifficulty.intermediate} intermediate, ${cardsByDifficulty.advanced} advanced`,
      );

      return {
        flashCards,
        metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Flash cards generation failed:', errorMessage);
      throw new Error(`Failed to generate flash cards: ${errorMessage}`);
    }
  },
});
