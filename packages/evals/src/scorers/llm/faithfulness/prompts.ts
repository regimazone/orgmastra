export const FAITHFULNESS_AGENT_INSTRUCTIONS = `You are a precise and thorough faithfulness evaluator. Your job is to determine if LLM outputs are factually consistent with the provided context, focusing on claim verification.

Key Principles:
1. First extract all statements from the output (both factual and speculative)
2. Then verify each extracted statement against the provided context
3. Consider a statement truthful if it is explicitly supported by the context
4. Consider a statement contradictory if it directly conflicts with the context
5. Consider a statement unsure if it is not mentioned in the context
6. Empty outputs should be handled as having no statements
7. Focus on factual consistency, not relevance or completeness
8. Never use prior knowledge in judgments
9. Statements with speculative language (may, might, possibly) should be marked as "unsure"`;

export const EXTRACT_PROMPT = `Extract all statements from the given output. A statement is any statement that asserts information, including both factual and speculative assertions.

Guidelines for statement extraction:
- Break down compound statements into individual claims
- Include all statements that assert information
- Include both definitive and speculative claims (using words like may, might, could)
- Extract specific details like numbers, dates, and quantities
- Keep relationships between entities
- Include predictions and possibilities
- Extract claims with their full context
- Exclude only questions and commands

Example:
Text: "The Tesla Model S was launched in 2012 and has a range of 405 miles. The car can accelerate from 0 to 60 mph in 1.99 seconds. I think it might be the best electric car ever made and could receive major updates next year."

{
    "statements": [
        "The Tesla Model S was launched in 2012",
        "The Tesla Model S has a range of 405 miles",
        "The Tesla Model S can accelerate from 0 to 60 mph in 1.99 seconds",
        "The Tesla Model S might be the best electric car ever made",
        "The Tesla Model S could receive major updates next year"
    ]
}
Note: All assertions are included, even speculative ones, as they need to be verified against the context.
===== END OF EXAMPLE ======

Please return only JSON format with "statements" array.
Return empty list for empty input. If the output is empty, return empty list.

Output:
{{output.content}}

JSON:
`;

export const SCORE_PROMPT = `Verify each statement against the provided context. Determine if each statement is supported by, contradicts, or is not mentioned in the context.

Context:
{{additionalContext.context}}

Statements to verify:
===== BEGIN OF STATEMENTS =====
{{extractedElements.statements}}
===== END OF STATEMENTS =====

For each statement, provide a verdict and reasoning. The verdict must be one of:
- "yes" if the statement is supported by the context
- "no" if the statement directly contradicts the context
- "unsure" if the statement is not mentioned in the context or cannot be verified

The number of results MUST MATCH the number of statements exactly.
If there are no statements, but the there is context, return an empty list.

Format:
{
    "results": [
        {
            "result": "yes/no/unsure",
            "reason": "explanation of verification"
        }
    ]
}

Rules:
- Only use information from the provided context
- Mark claims as "no" ONLY if they directly contradict the context
- Mark claims as "yes" if they are explicitly supported by the context
- Mark claims as "unsure" if they are not mentioned in the context
- Claims with speculative language (may, might, possibly) should be marked as "unsure"
- Never use prior knowledge in your judgment
- Provide clear reasoning for each verdict
- Be specific about where in the context the claim is supported or contradicted

Example:
Context: "The Tesla Model S was launched in 2012. The car has a maximum range of 375 miles and comes with advanced autopilot features."
Statements: ["The Tesla Model S was launched in 2012", "The Tesla Model S has a range of 405 miles", "The car might get software updates"]
{
    "results": [
        {
            "result": "yes",
            "reason": "This is explicitly stated in the context"
        },
        {
            "result": "no",
            "reason": "The context states the maximum range is 375 miles, contradicting the claim of 405 miles"
        },
        {
            "result": "unsure",
            "reason": "This is speculative and not mentioned in the context"
        }
    ]
}`;

export const generateFaithfulnessReasonPrompt = (
  scale: number,
) => `Explain the faithfulness score 0 is the lowest and ${scale} is the highest for the LLM's response using this context:

Context:
{{additionalContext.context}}

Input:
{{input.content}}

Output:
{{output.content}}

Score: {{score}}
Results:
{{extractedElements.results}}

Rules:
- Explain score based on ratio of supported statements ("yes" Results) to total statements
- Focus on factual consistency with context
- Keep explanation concise and focused
- Use given score, don't recalculate
- Explain both supported and contradicted aspects
- For mixed cases, explain the balance
- If no contradictions, use a positive but professional tone
- Base explanation only on the verified claims, not prior knowledge

Format:
{
    "reason": "The score is {score} because {explanation of faithfulness}"
}

Example Responses:
{
    "reason": "The score is 1.0 because all statements made in the output are supported by the provided context"
}
{
    "reason": "The score is 0.5 because while half of the statements are supported by the context, the remaining statements either contradict the context or cannot be verified"
}`;
