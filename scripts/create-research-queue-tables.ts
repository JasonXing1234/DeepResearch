import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function createTables() {
  console.log('📦 Creating research queue tables...\n');

  // Read the migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251023070000_add_research_queue.sql');
  let migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // Remove RLS enable statements for development
  migrationSql = migrationSql.replace(/ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/g, '-- RLS disabled for development');
  migrationSql = migrationSql.replace(/CREATE POLICY .*/g, '-- Policy disabled for development');

  // Use fetch to execute SQL directly
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      sql: migrationSql
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Error executing migration:', error);

    // Try using psql directly instead
    console.log('\n📝 Writing SQL to temp file and using psql...');
    const tempFile = '/tmp/research_queue_migration.sql';
    fs.writeFileSync(tempFile, migrationSql);

    const { execSync } = require('child_process');
    try {
      execSync(`PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f ${tempFile}`, {
        stdio: 'inherit'
      });
      console.log('✅ Migration applied via psql');
    } catch (psqlError) {
      console.error('❌ psql also failed');
      process.exit(1);
    }
  } else {
    console.log('✅ Migration applied successfully!');
  }

  console.log('\n🔍 Verifying tables...');

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('research_queue')
    .select('count')
    .limit(1);

  if (error) {
    console.error('❌ Verification failed:', error.message);
  } else {
    console.log('✅ research_queue table exists and is accessible');
  }
}

createTables();
