import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WebSearch } from '@/lib/web-search';
import { inngest } from '@/inngest/client';

export const maxDuration = 300; 

interface CompanyInput {
  name: string;
}

interface AnalysisDetail {
  company_name: string;
  attribute: string;
  yes_no: 'Yes' | 'No';
  text: string;
  source: string;
  url: string | null;
}

interface AnalysisResult {
  company_name: string;
  commitment_to_reduce: boolean;
  net_zero_target: boolean;
  pilot: boolean;
  investment_announced: boolean;
  equipment_purchased: boolean;
  project_environment: boolean;
}

interface AnalysisDiagnostic {
  company_name: string;
  emissions: number;
  investments: number;
  purchases: number;
  pilots: number;
  environments: number;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8'; 

  try {
    const body = await req.json();
    const { companies, projectId } = body;

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Companies array is required' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    
    const companyNames = companies.map((c: CompanyInput) => c.name);
    const { data: queueEntry, error: queueError } = await supabase
      .from('research_queue')
      .insert({
        user_id: userId,
        companies: companyNames,
        status: 'processing',
        project_id: projectId,
        total_companies: companyNames.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (queueError || !queueEntry) {
      console.error('Error creating queue entry:', queueError);
      return NextResponse.json(
        { success: false, error: 'Failed to create research queue entry' },
        { status: 500 }
      );
    }

    try {
      
      const results = await Promise.all(
        companies.map((company: CompanyInput) => researchCompany(company.name))
      );

    
    const emissionsReport = generateReport(results, 'emissions');
    const investmentsReport = generateReport(results, 'investments');
    const purchasesReport = generateReport(results, 'purchases');
    const pilotsReport = generateReport(results, 'pilots');
    const environmentsReport = generateReport(results, 'environments');

      
      const uploadPromises = [
        { type: 'emissions', content: emissionsReport },
        { type: 'investments', content: investmentsReport },
        { type: 'machine_purchases', content: purchasesReport },
        { type: 'pilot_projects', content: pilotsReport },
        { type: 'project_environments', content: environmentsReport },
      ].map(async ({ type, content }) => {
        const fileName = `${userId}/${projectId}/${type}_${Date.now()}.json`;
        const { data, error } = await supabase.storage
          .from('sustainability-reports')
          .upload(fileName, content, {
            contentType: 'application/json',
            upsert: false,
          });

        if (error) {
          console.error(`Error uploading ${type} report:`, error);
          return null;
        }

        return { type, path: data.path, content };
      });

      const uploadResults = await Promise.all(uploadPromises);
      const uploadedFiles = uploadResults.filter(Boolean);

    
    const fileUpdateData: Record<string, string> = {};

    for (const file of uploadedFiles) {
      if (!file) continue;

      
      const { data: fileRecord, error: fileError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          file_type: file.type,
          original_filename: `${file.type}_${Date.now()}.json`,
          storage_bucket: 'sustainability-reports',
          file_path: file.path,
          file_size_bytes: 0, 
          mime_type: 'application/json',
          upload_status: 'completed',
        })
        .select()
        .single();

      if (fileError) {
        console.error(`Error creating file record for ${file.type}:`, fileError);
        continue;
      }

      
      fileUpdateData[`${file.type}_file_id`] = fileRecord.id;
    }

      const { error: updateError } = await supabase
        .from('sustainability_projects')
        .update(fileUpdateData)
        .eq('id', projectId);

      if (updateError) {
        console.error('Error updating project:', updateError);
      }

      
      for (const file of uploadedFiles) {
        if (!file) continue;

        
        const parsedContent = JSON.parse(file.content);
        const companyCount = Array.isArray(parsedContent) ? parsedContent.length : 0;

        
        for (let i = 0; i < companyCount; i++) {
          const companyData = parsedContent[i];
          const companyName = companyData?.Company || companyData?.company || `Unknown-${i}`;

          const { data: docData, error: docError } = await supabase
            .from('research_documents')
            .insert({
              research_id: queueEntry.id,
              company_name: companyName,
              category: file.type,
              storage_bucket: 'sustainability-reports',
              file_path: file.path,
              file_size_bytes: Buffer.byteLength(file.content, 'utf8'),
              mime_type: 'application/json',
              vectorization_status: 'pending',
              segment_count: 0,
            })
            .select()
            .single();

          if (docError) {
            console.error('Error creating research document:', docError);
            continue;
          }

          
          await inngest.send({
            name: 'research/document.created',
            data: {
              researchDocumentId: docData.id,
              userId: userId,
            },
          });
        }
      }

      
      await supabase
        .from('research_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          files_generated: uploadedFiles.length,
        })
        .eq('id', queueEntry.id);

      return NextResponse.json({
        success: true,
        message: `Successfully researched ${companies.length} companies`,
        uploadedFiles: uploadedFiles.length,
        researchId: queueEntry.id,
      });
    } catch (innerError) {
      
      await supabase
        .from('research_queue')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: innerError instanceof Error ? innerError.message : 'Unknown error',
        })
        .eq('id', queueEntry.id);

      throw innerError;
    }
  } catch (error) {
    console.error('Error researching companies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to research companies' },
      { status: 500 }
    );
  }
}

async function researchCompany(companyName: string) {
  const searchClient = new WebSearch();

  try {
    
    const [emissionsResults, investmentsResults, purchasesResults, pilotsResults, environmentsResults] =
      await Promise.all([
        searchClient.search(
          `${companyName} carbon emissions reduction commitment net zero climate pledge 2024 2025`
        ),
        searchClient.search(
          `${companyName} sustainability investment renewable energy climate fund 2024 2025`
        ),
        searchClient.search(
          `${companyName} equipment purchase clean energy renewable infrastructure 2024 2025`
        ),
        searchClient.search(
          `${companyName} pilot project carbon capture sustainability initiative 2024 2025`
        ),
        searchClient.search(
          `${companyName} project environment sustainability facility green building 2024 2025`
        ),
      ]);

    return {
      company: companyName,
      emissions: emissionsResults,
      investments: investmentsResults,
      purchases: purchasesResults,
      pilots: pilotsResults,
      environments: environmentsResults,
    };
  } catch (error) {
    console.error(`Error researching ${companyName}:`, error);
    return {
      company: companyName,
      emissions: [],
      investments: [],
      purchases: [],
      pilots: [],
      environments: [],
    };
  }
}

function generateReport(
  results: any[],
  category: 'emissions' | 'investments' | 'purchases' | 'pilots' | 'environments'
): string {
  const reportData: any[] = [];

  for (const result of results) {
    const searchResults = result[category] || [];

    if (searchResults.length === 0) continue;

    
    switch (category) {
      case 'emissions':
        reportData.push(generateEmissionsData(result.company, searchResults));
        break;
      case 'investments':
        reportData.push(generateInvestmentsData(result.company, searchResults));
        break;
      case 'purchases':
        reportData.push(generatePurchasesData(result.company, searchResults));
        break;
      case 'pilots':
        reportData.push(generatePilotsData(result.company, searchResults));
        break;
      case 'environments':
        reportData.push(generateEnvironmentsData(result.company, searchResults));
        break;
    }
  }

  
  return JSON.stringify(reportData, null, 2);
}

function generateEmissionsData(company: string, searchResults: any[]) {
  
  const topResult = searchResults[0];
  const content = topResult.snippet || topResult.content || '';

  
  const targetMatch = content.match(/(\d+)%\s+(?:reduction|target|by)/i);
  const yearMatch = content.match(/(?:by|target year)\s+(\d{4})/i);
  const netZeroMatch = content.match(/net[\s-]zero/i);

  return {
    'Company': company,
    'Emissions Reduction Target': targetMatch ? `${targetMatch[1]}%` : 'Not specified',
    'Target Year': yearMatch ? yearMatch[1] : 'Not specified',
    'Baseline Year': 'Not specified',
    'Pledge Year': 'Not specified',
    'Net-Zero Target': !!netZeroMatch,
    'Source': searchResults.slice(0, 3).map(r => r.url).filter(Boolean),
    'Comments': content.substring(0, 200) + '...'
  };
}

function generateInvestmentsData(company: string, searchResults: any[]) {
  
  const topResult = searchResults[0];
  const content = topResult?.snippet || topResult?.content || '';
  const title = topResult?.title || '';

  
  const investmentTypes = [
    'renewable energy', 'solar', 'wind', 'electric vehicles',
    'EV', 'charging', 'carbon', 'sustainability', 'clean energy'
  ];

  const matchedType = investmentTypes.find(type =>
    content.toLowerCase().includes(type) || title.toLowerCase().includes(type)
  );

  return {
    'Company': company,
    'Investment Type': matchedType ? (matchedType.charAt(0).toUpperCase() + matchedType.slice(1)) : 'General Sustainability Investment',
    'Announcement Date': 'Not specified',
    'Description': content.substring(0, 300) + '...',
    'Source URLs': searchResults.slice(0, 3).map(r => r.url).filter(Boolean)
  };
}

function generatePurchasesData(company: string, searchResults: any[]) {
  
  const topResult = searchResults[0];
  const content = topResult?.snippet || topResult?.content || '';

  
  const quantityMatch = content.match(/(\d+)\s+(?:new\s+)?(?:truck|vehicle|machine|unit)/i);

  return {
    'Company': company,
    'Manufacturer': 'Not specified',
    'MachineType': 'Equipment',
    'Model': 'Not specified',
    'Quantity': quantityMatch ? parseInt(quantityMatch[1]) : 0,
    'PurchaseDate': 'Not specified',
    'SourceURLs': searchResults.slice(0, 3).map(r => r.url).filter(Boolean),
    'Comments': content.substring(0, 150) + '...'
  };
}

function generatePilotsData(company: string, searchResults: any[]) {
  
  const topResult = searchResults[0];
  const content = topResult?.snippet || topResult?.content || '';
  const title = topResult?.title || '';

  return {
    'Company': company,
    'Project Name': title.substring(0, 100) || 'Sustainability Project',
    'Project Type': 'Sustainability Initiative',
    'Involvement': 'Implementation',
    'Lower Emissions Approach': content.substring(0, 200) + '...',
    'Electric Equipment & Manufacturer': 'Not specified',
    'Project Description': content.substring(0, 300) + '...',
    'Sources': topResult?.url || ''
  };
}

function generateEnvironmentsData(company: string, searchResults: any[]) {
  
  const topResult = searchResults[0];
  const content = topResult?.snippet || topResult?.content || '';
  const title = topResult?.title || '';

  return {
    'Company': company,
    'Project': title.substring(0, 100) || 'Facility Project',
    'constraint type': 'Environmental Constraint',
    'Project date': 'Not specified',
    'Description': content.substring(0, 300) + '...',
    'Source': topResult?.url || ''
  };
}
