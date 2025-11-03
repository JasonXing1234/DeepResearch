import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const apiBaseUrl = 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testVectorization() {
  console.log('🧪 Testing Research Document Vectorization\n');
  console.log('============================================================\n');

  
  console.log('📝 Step 1: Creating test project...');
  const projectResponse = await fetch(`${apiBaseUrl}/api/sustainability/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Vectorization Test',
      description: 'Testing research document vectorization',
    }),
  });

  const projectData = await projectResponse.json();
  if (!projectData.success) {
    console.error('❌ Failed to create project:', projectData.error);
    process.exit(1);
  }

  const projectId = projectData.project.id;
  console.log(`✅ Project created: ${projectId}\n`);

  
  console.log('🔍 Step 2: Running research for Tesla...');
  const researchResponse = await fetch(`${apiBaseUrl}/api/research-companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companies: [{ name: 'Tesla' }],
      projectId: projectId,
    }),
  });

  const researchData = await researchResponse.json();
  if (!researchData.success) {
    console.error('❌ Research failed:', researchData.error);
    process.exit(1);
  }

  const researchId = researchData.researchId;
  console.log(`✅ Research completed: ${researchId}`);
  console.log(`   Files generated: ${researchData.uploadedFiles}\n`);

  
  console.log('⏳ Step 3: Waiting for vectorization (this may take 30-60 seconds)...\n');

  let attempts = 0;
  const maxAttempts = 60; 
  let allCompleted = false;

  while (attempts < maxAttempts && !allCompleted) {
    attempts++;

    
    const { data: docs, error } = await supabase
      .from('research_documents')
      .select('id, company_name, category, vectorization_status, segment_count')
      .eq('research_id', researchId);

    if (error) {
      console.error('❌ Error checking status:', error);
      break;
    }

    const pending = docs?.filter(d => d.vectorization_status === 'pending').length || 0;
    const processing = docs?.filter(d => d.vectorization_status === 'processing').length || 0;
    const completed = docs?.filter(d => d.vectorization_status === 'completed').length || 0;
    const failed = docs?.filter(d => d.vectorization_status === 'failed').length || 0;

    process.stdout.write(`\r   [${attempts}s] Pending: ${pending}, Processing: ${processing}, Completed: ${completed}, Failed: ${failed}    `);

    if (pending === 0 && processing === 0 && completed > 0) {
      allCompleted = true;
      console.log('\n\n✅ Vectorization completed!\n');
    }

    if (failed > 0) {
      console.log('\n\n⚠️  Some documents failed to vectorize\n');
      break;
    }

    if (!allCompleted) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!allCompleted && attempts >= maxAttempts) {
    console.log('\n\n⏱️  Timeout waiting for vectorization\n');
  }

  
  console.log('📊 Step 4: Final Results\n');

  const { data: finalDocs } = await supabase
    .from('research_documents')
    .select('*')
    .eq('research_id', researchId);

  console.log('Documents:');
  finalDocs?.forEach((doc, idx) => {
    console.log(`  ${idx + 1}. ${doc.category} - ${doc.company_name}`);
    console.log(`     Status: ${doc.vectorization_status}`);
    console.log(`     Segments: ${doc.segment_count}`);
  });

  
  const { data: segments } = await supabase
    .from('research_segments')
    .select('id, company_name, category')
    .in('research_document_id', finalDocs?.map(d => d.id) || []);

  console.log(`\nTotal Segments: ${segments?.length || 0}`);

  if (segments && segments.length > 0) {
    console.log('\nSegment Breakdown:');
    const byCategory: Record<string, number> = {};
    segments.forEach(s => {
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    });
    Object.entries(byCategory).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count} segments`);
    });
  }

  console.log('\n============================================================');
  console.log('🎉 Test Complete!\n');

  if (allCompleted && (segments?.length || 0) > 0) {
    console.log('✅ SUCCESS: Research documents were successfully vectorized');
    console.log(`   - ${finalDocs?.length || 0} documents processed`);
    console.log(`   - ${segments?.length || 0} vector embeddings created`);
  } else {
    console.log('⚠️  INCOMPLETE: Vectorization did not complete successfully');
  }

  console.log('\n💡 Next Steps:');
  console.log('   - Check Inngest dashboard at http://localhost:8288');
  console.log('   - View research history in the UI');
  console.log('   - Try searching for Tesla in the RAG system\n');
}

testVectorization().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
