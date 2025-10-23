'use client'

import { useState, useEffect } from 'react';
import { Search, Trash2, Download, Loader2, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import { useResearch, type ResearchQuery } from '@/contexts/ResearchContext';

const MOCK_RESULTS: ResearchQuery = {
  id: '1',
  companies: ['Apple', 'Microsoft', 'Google'],
  status: 'completed',
  created_at: '2024-01-15',
  datasets: {
    emissions: [
      { company: 'Apple', commitment_to_reduce: true, target_year: 2030, reduction_percent: 75 },
      { company: 'Microsoft', commitment_to_reduce: true, target_year: 2030, reduction_percent: 100 },
      { company: 'Google', commitment_to_reduce: true, target_year: 2030, reduction_percent: 75 },
    ],
    investments: [
      { company: 'Apple', investment_amount: '$15B', focus: 'Renewable energy' },
      { company: 'Microsoft', investment_amount: '$10B', focus: 'Carbon removal' },
      { company: 'Google', investment_amount: '$12B', focus: 'Clean energy' },
    ],
    purchases: [
      { company: 'Apple', equipment_type: 'Manufacturing', quantity: 500 },
      { company: 'Microsoft', equipment_type: 'Data centers', quantity: 200 },
      { company: 'Google', equipment_type: 'Facilities', quantity: 400 },
    ],
    pilots: [
      { company: 'Apple', pilot_name: 'Zero waste retail', status: 'ongoing' },
      { company: 'Microsoft', pilot_name: 'Renewable energy grid', status: 'ongoing' },
      { company: 'Google', pilot_name: 'AI energy optimization', status: 'pilot' },
    ],
    environments: [
      { company: 'Apple', constraint: 'Water usage reduction', severity: 'high' },
      { company: 'Microsoft', constraint: 'Biodiversity protection', severity: 'medium' },
      { company: 'Google', constraint: 'Supply chain emissions', severity: 'high' },
    ],
  },
};

export function DeepResearchEngine() {
  const [companies, setCompanies] = useState(['', '', '', '']);
  const [isResearching, setIsResearching] = useState(false);
  const { queries, addQuery, deleteQuery } = useResearch();

  const companyInputs = companies.filter((c) => c.trim()).length;

  const handleCompanyChange = (index: number, value: string) => {
    const newCompanies = [...companies];
    newCompanies[index] = value;
    setCompanies(newCompanies);
  };

  const handleRunResearch = async () => {
    const activeCompanies = companies.filter((c) => c.trim());

    if (activeCompanies.length === 0) {
      toast.error('Enter at least one company name');
      return;
    }

    setIsResearching(true);
    toast.info('Starting deep research... (simulated)');

    // Simulate research delay
    setTimeout(() => {
      const newQuery: ResearchQuery = {
        id: Math.random().toString(36).substr(2, 9),
        companies: activeCompanies,
        status: 'completed',
        created_at: new Date().toISOString().split('T')[0],
        datasets: MOCK_RESULTS.datasets,
      };

      addQuery(newQuery);
      setIsResearching(false);
      setCompanies(['', '', '', '']);
      toast.success('Research completed! Datasets generated.');
    }, 2000);
  };

  const handleExportJSON = (query: ResearchQuery, datasetType: string) => {
    if (!query.datasets) return;

    const data = query.datasets[datasetType as keyof typeof query.datasets];
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${datasetType}_${query.id}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success(`Downloaded ${datasetType}.json`);
  };

  const handleDeleteQuery = (id: string) => {
    deleteQuery(id);
    toast.success('Research query deleted');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Deep Research Engine</h2>
          <p className="text-gray-600 mt-1">
            Automated web research for up to 4 companies. Generates structured ESG datasets.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Input Section */}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-purple-600" />
              Enter Companies to Research
            </CardTitle>
            <CardDescription>
              Enter up to 4 company names. The system will perform automated web research and
              generate five structured JSON datasets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companies.map((company, index) => (
                <Input
                  key={index}
                  value={company}
                  onChange={(e) => handleCompanyChange(index, e.target.value)}
                  placeholder={`Company ${index + 1}${index < 1 ? ' (required)' : ' (optional)'}`}
                  disabled={isResearching}
                />
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button
                onClick={handleRunResearch}
                disabled={isResearching || companyInputs === 0}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isResearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Run Deep Research
                  </>
                )}
              </Button>
              <p className="text-sm text-gray-600">
                {companyInputs} company{companyInputs !== 1 ? 'ies' : ''} to research
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-900">
              <p className="font-semibold mb-2">Generated Datasets:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Emissions Reductions</li>
                <li>Investments & Commitments</li>
                <li>Machine/Equipment Purchases</li>
                <li>Pilot Projects</li>
                <li>Environmental Constraints</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Research History</h3>
          {queries.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-12">
                <p className="text-center text-gray-500">
                  No research queries yet. Start by entering companies above.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {queries.map((query) => (
                <Card key={query.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {query.companies.join(', ')}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Researched on {query.created_at}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Completed
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {['emissions', 'investments', 'purchases', 'pilots', 'environments'].map((type) => (
                        <Button
                          key={type}
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportJSON(query, type)}
                          className="h-auto flex flex-col items-center gap-2 py-2"
                        >
                          <Download className="h-4 w-4" />
                          <span className="text-xs font-medium capitalize">
                            {type === 'investments' ? 'Investments' : type}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
