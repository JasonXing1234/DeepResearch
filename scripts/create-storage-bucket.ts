import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBucket() {
  console.log('Creating sustainability-reports bucket...');

  
  const { data: existing } = await supabase.storage.listBuckets();
  const bucketExists = existing?.some(b => b.name === 'sustainability-reports');

  if (bucketExists) {
    console.log('✅ Bucket already exists');
    return;
  }

  
  const { data, error } = await supabase.storage.createBucket('sustainability-reports', {
    public: false,
    fileSizeLimit: 52428800, 
    allowedMimeTypes: ['text/plain', 'application/json', 'application/octet-stream'],
  });

  if (error) {
    console.error('❌ Error creating bucket:', error);
    process.exit(1);
  }

  console.log('✅ Bucket created successfully:', data);
}

createBucket();
