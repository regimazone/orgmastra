import { D1Store } from './index';

// Test function to verify the domain interface pattern is working
export function testDomainInterface() {
  // Mock D1 client for testing
  const mockClient = {
    query: async ({ sql, params }: { sql: string; params: string[] }) => {
      return { result: [{ results: [] }] };
    },
  };

  // Create D1Store instance with mock client
  const store = new D1Store({
    client: mockClient,
    tablePrefix: 'test_',
  });

  // Test that domain stores are accessible
  console.log('Testing domain interface...');

  // Test that all domain stores exist
  if (!store.stores) {
    throw new Error('stores property not found');
  }

  if (!store.stores.operations) {
    throw new Error('operations domain not found');
  }

  if (!store.stores.memory) {
    throw new Error('memory domain not found');
  }

  if (!store.stores.scores) {
    throw new Error('scores domain not found');
  }

  if (!store.stores.traces) {
    throw new Error('traces domain not found');
  }

  if (!store.stores.workflows) {
    throw new Error('workflows domain not found');
  }

  if (!store.stores.legacyEvals) {
    throw new Error('legacyEvals domain not found');
  }

  // Test supports property
  const supports = store.supports;
  if (!supports.selectByIncludeResourceScope) {
    throw new Error('selectByIncludeResourceScope support not found');
  }

  if (!supports.resourceWorkingMemory) {
    throw new Error('resourceWorkingMemory support not found');
  }

  if (!supports.hasColumn) {
    throw new Error('hasColumn support not found');
  }

  if (!supports.createTable) {
    throw new Error('createTable support not found');
  }

  console.log('✅ Domain interface test passed! All domains are properly accessible.');
  
  return store;
}

// Run the test
if (require.main === module) {
  try {
    testDomainInterface();
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}