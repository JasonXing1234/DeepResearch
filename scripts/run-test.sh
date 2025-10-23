#!/bin/bash

# Company Research Agent Test Runner
# Tests researching: BASF, Vulcan Materials, Ziegler CAT, and Harsco Metals Group

echo "========================================"
echo "Company Research Agent Test"
echo "========================================"
echo ""

# Check if dev server is running
echo "Checking if Next.js dev server is running..."
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Error: Next.js dev server is not running"
    echo "   Please start it with: npm run dev"
    exit 1
fi
echo "✅ Dev server is running"
echo ""

# Check if Supabase is running
echo "Checking if Supabase is running..."
if ! curl -s http://127.0.0.1:54321 > /dev/null; then
    echo "❌ Error: Supabase is not running"
    echo "   Please start it with: npx supabase start"
    exit 1
fi
echo "✅ Supabase is running"
echo ""

# Check environment variables
echo "Checking environment variables..."
if [ -z "$TAVILY_API_KEY" ]; then
    echo "⚠️  Warning: TAVILY_API_KEY not found in environment"
    echo "   Checking .env.local..."
    if [ -f .env.local ] && grep -q "TAVILY_API_KEY" .env.local; then
        echo "✅ TAVILY_API_KEY found in .env.local"
    else
        echo "❌ Error: TAVILY_API_KEY not configured"
        echo "   Please add it to .env.local"
        exit 1
    fi
else
    echo "✅ TAVILY_API_KEY configured"
fi
echo ""

# Run the test
echo "Starting test..."
echo ""

npx tsx scripts/test-research-agent.ts

echo ""
echo "========================================"
echo "Test completed"
echo "========================================"
