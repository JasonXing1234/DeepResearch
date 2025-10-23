#!/bin/bash

echo "════════════════════════════════════════════════════════════"
echo "Research Queue System Test"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

# Check if Supabase is running
if ! docker ps | grep -q supabase_db; then
    echo "❌ Supabase is not running!"
    echo "   Run: npx supabase start"
    exit 1
fi

# Check if Next.js dev server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Next.js dev server is not running!"
    echo "   Run: npm run dev"
    exit 1
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo "   Copy .env.example to .env.local and configure it."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Run the test
npx tsx scripts/test-research-queue.ts

exit $?
