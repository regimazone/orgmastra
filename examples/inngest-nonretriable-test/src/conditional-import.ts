// This file demonstrates a case where NonRetriableError might not be captured
// by the bundler's static analysis

export async function handleError(condition: boolean) {
  if (condition) {
    // Dynamic import that might not be analyzed statically
    const { NonRetriableError } = await import('inngest');
    throw new NonRetriableError("Dynamic import error");
  }
}

// Or a conditional require scenario
export function handleErrorSync(condition: boolean) {
  if (condition) {
    const inngest = require('inngest');
    throw new inngest.NonRetriableError("Conditional require error");
  }
}