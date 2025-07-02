#!/usr/bin/env tsx

/**
 * Prompt CMS Demo Script
 *
 * This script demonstrates the key features of the Prompt CMS:
 * - Creating prompts with versioning
 * - Using templates for common patterns
 * - Executing prompts with variables
 * - Managing versions and publishing
 * - Viewing analytics and execution history
 */

import { PromptService } from './src/services/PromptService.js';
import { mastra } from './src/mastra/index.js';

const promptService = new PromptService();

async function runDemo() {
  console.log('🚀 Starting Prompt CMS Demo\n');

  try {
    // 1. Create a marketing copy prompt
    console.log('📝 Creating marketing copy prompt...');
    const marketingPrompt = await promptService.createPrompt(
      {
        name: 'Marketing Copy Generator',
        description: 'Generate compelling marketing copy for products',
        category: 'marketing',
        tags: ['marketing', 'copywriting', 'sales'],
        content: `Create compelling marketing copy for {{product_name}}.

Product Details:
- Category: {{category}}
- Target Audience: {{target_audience}}
- Key Benefits: {{benefits}}
- Price Point: {{price_point}}

Requirements:
- Tone: {{tone}}
- Length: {{length}}
- Include a strong call-to-action
- Highlight the main value proposition

Marketing Copy:`,
        variables: ['product_name', 'category', 'target_audience', 'benefits', 'price_point', 'tone', 'length'],
      },
      'demo-user',
    );

    console.log(`✅ Created prompt: "${marketingPrompt.name}" (ID: ${marketingPrompt.id})\n`);

    // 2. Create a system prompt using template
    console.log('🤖 Creating system prompt using template...');
    const codeReviewPrompt = await promptService.createSystemPrompt(
      'Senior Code Reviewer',
      'a senior software engineer with 10+ years of experience',
      'Review the provided code for best practices, potential bugs, security issues, and performance improvements. Provide constructive feedback with specific suggestions and explanations.',
      [
        'Focus on code quality, readability, and maintainability',
        'Identify potential security vulnerabilities',
        'Suggest performance optimizations where applicable',
        'Be constructive and educational in your feedback',
        'Provide specific examples when suggesting improvements',
      ],
      [
        {
          input:
            'function calculateTotal(items) { let total = 0; for(let i = 0; i < items.length; i++) { total += items[i].price; } return total; }',
          output:
            'Good basic implementation! Consider these improvements: 1) Add type annotations, 2) Use reduce() for better readability, 3) Add input validation. Example: function calculateTotal(items: Item[]): number { if (!Array.isArray(items)) throw new Error("Invalid input"); return items.reduce((total, item) => total + (item.price || 0), 0); }',
        },
      ],
      'demo-user',
    );

    console.log(`✅ Created system prompt: "${codeReviewPrompt.name}"\n`);

    // 3. Create a chat prompt using template
    console.log('💬 Creating chat prompt using template...');
    const supportPrompt = await promptService.createChatPrompt(
      'Customer Support Assistant',
      'You are a helpful and empathetic customer support representative. Always be polite, professional, and solution-oriented. If you cannot solve an issue, escalate appropriately.',
      'Customer Issue: {{issue_description}}\nCustomer Sentiment: {{sentiment}}\nAccount Type: {{account_type}}\n\nPlease provide a helpful response that addresses their concern and offers next steps.',
      'demo-user',
    );

    console.log(`✅ Created chat prompt: "${supportPrompt.name}"\n`);

    // 4. Create a new version of the marketing prompt
    console.log('📋 Creating new version of marketing prompt...');
    const marketingPromptWithVersions = await promptService.getPrompt(marketingPrompt.id);
    if (marketingPromptWithVersions) {
      const newVersion = await promptService.createVersion(
        marketingPrompt.id,
        {
          content: `Generate high-converting marketing copy for {{product_name}}.

Product Information:
- Category: {{category}}
- Target Audience: {{target_audience}}
- Key Benefits: {{benefits}}
- Price: {{price_point}}
- Unique Selling Proposition: {{usp}}

Style Guidelines:
- Tone: {{tone}}
- Length: {{length}}
- Format: {{format}}

Include:
✓ Attention-grabbing headline
✓ Compelling value proposition
✓ Social proof elements
✓ Strong call-to-action
✓ Urgency/scarcity elements

Marketing Copy:`,
          variables: [
            'product_name',
            'category',
            'target_audience',
            'benefits',
            'price_point',
            'usp',
            'tone',
            'length',
            'format',
          ],
        },
        'demo-user',
      );

      console.log(`✅ Created version ${newVersion.version} for marketing prompt\n`);

      // 5. Publish the new version
      console.log('🚀 Publishing new version...');
      await promptService.publishVersion(newVersion.id);
      console.log(`✅ Published version ${newVersion.version}\n`);
    }

    // 6. Execute a prompt with variables
    console.log('⚡ Executing marketing prompt...');

    // Mock LLM function for demo
    const mockLLMGenerate = async (prompt: string): Promise<string> => {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      return `🎯 **Revolutionary Fitness Tracker - Transform Your Health Journey!**

Discover the SmartFit Pro, the ultimate fitness companion designed specifically for busy professionals who refuse to compromise on their health goals.

**Why SmartFit Pro Changes Everything:**
✨ 24/7 health monitoring with medical-grade precision
✨ AI-powered workout recommendations that adapt to your schedule
✨ Seamless integration with your busy lifestyle
✨ Proven to increase fitness consistency by 300%

**What Our Users Say:**
"Finally, a fitness tracker that actually helps me stay consistent!" - Sarah K., Marketing Executive

**Limited Time Offer:** Get your SmartFit Pro for just $199 (usually $299) - but only for the next 48 hours!

**Ready to transform your health?**
🔥 **ORDER NOW** and join over 50,000 professionals who've already revolutionized their fitness journey!

*Free shipping included. 30-day money-back guarantee. No questions asked.*`;
    };

    const executionResult = await promptService.executePrompt(
      {
        promptId: marketingPrompt.id,
        variables: {
          product_name: 'SmartFit Pro',
          category: 'Fitness Technology',
          target_audience: 'busy professionals aged 25-45',
          benefits: 'real-time health monitoring, personalized workout plans, stress tracking',
          price_point: '$199 (premium)',
          usp: 'AI-powered fitness coach that adapts to your schedule',
          tone: 'enthusiastic and motivating',
          length: '200-300 words',
          format: 'social media post',
        },
      },
      mockLLMGenerate,
      'gpt-4',
    );

    console.log('📊 Execution Result:');
    console.log('─'.repeat(50));
    console.log(executionResult.result);
    console.log('─'.repeat(50));
    console.log(`⏱️  Execution time: ${executionResult.execution.duration}ms`);
    console.log(`✅ Success: ${executionResult.execution.success}\n`);

    // 7. Get system statistics
    console.log('📈 Getting system statistics...');
    const stats = await promptService.getPromptStats();
    const categories = await promptService.getCategories();
    const tags = await promptService.getAllTags();

    console.log('📊 System Statistics:');
    console.log(`   • Total Prompts: ${stats.totalPrompts}`);
    console.log(`   • Total Versions: ${stats.totalVersions}`);
    console.log(`   • Total Executions: ${stats.totalExecutions}`);
    console.log(`   • Recent Executions (24h): ${stats.recentExecutions}`);
    console.log(`   • Categories: ${categories.join(', ')}`);
    console.log(`   • Tags: ${tags.slice(0, 10).join(', ')}${tags.length > 10 ? '...' : ''}\n`);

    // 8. Search prompts
    console.log('🔍 Searching prompts...');
    const searchResults = await promptService.searchPrompts('marketing', 'marketing');
    console.log(`Found ${searchResults.length} marketing prompts:`);
    searchResults.forEach(prompt => {
      console.log(`   • ${prompt.name} (${prompt.category})`);
    });
    console.log();

    // 9. Demonstrate Mastra agent integration
    console.log('🤖 Demonstrating Mastra Agent Integration...');
    try {
      const agent = mastra.getAgent('promptAgent');

      // This would work if the agent was properly configured with LLM
      console.log('Agent available for prompt management tasks');
      console.log('   • Use agent.generate() with tool calls for automated prompt management');
      console.log('   • Available tools: create_prompt, execute_prompt, list_prompts, etc.\n');
    } catch (error) {
      console.log('⚠️  Agent integration requires proper LLM configuration\n');
    }

    // 10. Show execution history
    if (marketingPromptWithVersions?.versions[0]) {
      console.log('📜 Viewing execution history...');
      const history = await promptService.getExecutionHistory(marketingPromptWithVersions.versions[0].id, 5);
      console.log(`Found ${history.length} recent executions for this version`);
      history.forEach((execution, index) => {
        console.log(
          `   ${index + 1}. ${execution.executedAt.toISOString()} - ${execution.success ? '✅' : '❌'} (${execution.duration}ms)`,
        );
      });
      console.log();
    }

    console.log('🎉 Demo completed successfully!');
    console.log('\n💡 Try the REST API:');
    console.log('   • GET  http://localhost:3000/api/stats');
    console.log('   • GET  http://localhost:3000/api/prompts');
    console.log('   • POST http://localhost:3000/api/prompts/execute');
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo };
