import { describe, it, expect } from 'vitest';

describe('InMemoryMemory JSON parsing bug', () => {
  it('should demonstrate JSON.parse creating numbered object from string', () => {
    // This demonstrates what happens when you JSON.parse a plain string
    const originalString = 'This is a test message';

    // When we store a string as-is and then JSON.parse it
    try {
      const parsed = JSON.parse(originalString);
      console.log('Parsed result:', parsed);
      console.log('Type:', typeof parsed);
    } catch (error) {
      console.log('JSON.parse error:', error.message);
      // This is what actually happens - JSON.parse throws an error on plain strings
    }

    // But if the string gets JSON.stringified first (which it shouldn't for plain strings)
    const stringified = JSON.stringify(originalString);
    console.log('Stringified:', stringified); // "\"This is a test message\""
    const parsed = JSON.parse(stringified);
    console.log('Parsed stringified:', parsed); // "This is a test message"

    // The bug might be that somewhere the string is being treated as an object
    // Let's see what happens if we incorrectly handle a string as object
    const strAsObject = Object.assign({}, originalString);
    console.log('String as object:', strAsObject);
    console.log('String as object stringified:', JSON.stringify(strAsObject));

    // This creates the numbered keys!
    expect(strAsObject).toEqual({
      '0': 'T',
      '1': 'h',
      '2': 'i',
      '3': 's',
      '4': ' ',
      '5': 'i',
      '6': 's',
      '7': ' ',
      '8': 'a',
      '9': ' ',
      '10': 't',
      '11': 'e',
      '12': 's',
      '13': 't',
      '14': ' ',
      '15': 'm',
      '16': 'e',
      '17': 's',
      '18': 's',
      '19': 'a',
      '20': 'g',
      '21': 'e',
    });
  });
});
