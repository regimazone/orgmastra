#!/bin/bash
# Simple script to test the debug command with a real GitHub issue

# Make sure we're authenticated with gh
if ! gh auth status &> /dev/null; then
    echo "Error: Please authenticate with GitHub CLI first"
    echo "Run: gh auth login"
    exit 1
fi

# Test with issue 5380 (the one from the user's example)
echo "Testing debug command with issue #5380..."
echo "5380" | pnpm debug