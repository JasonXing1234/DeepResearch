'use client'

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface CompanyResearchViewProps {
  projectId: string;
  projectName: string;
  onResearchComplete: () => void;
}

export function CompanyResearchView({
  projectId,
  projectName,
  onResearchComplete,
}: CompanyResearchViewProps) {
  const [companies, setCompanies] = useState<string[]>(['']);
  const [isResearching, setIsResearching] = useState(false);

  const handleAddCompany = () => {
    setCompanies([...companies, '']);
  };

  const handleRemoveCompany = (index: number) => {
    setCompanies(companies.filter((_, i) => i !== index));
  };

  const handleCompanyChange = (index: number, value: string) => {
    const newCompanies = [...companies];
    newCompanies[index] = value;
    setCompanies(newCompanies);
  };

  const handleResearch = async () => {
    // Filter out empty company names
    const validCompanies = companies
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .map((name) => ({ name }));

    if (validCompanies.length === 0) {
      toast.error('Please enter at least one company name');
      return;
    }

    try {
      setIsResearching(true);

      const response = await fetch('/api/research-companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companies: validCompanies,
          projectId: projectId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `Successfully researched ${validCompanies.length} companies and generated reports`
        );
        onResearchComplete();
      } else {
        toast.error(data.error || 'Research failed');
      }
    } catch (error) {
      console.error('Error researching companies:', error);
      toast.error('Error researching companies');
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Research Companies</h2>
            <p className="text-sm text-gray-600 mt-1">
              Project: {projectName}
            </p>
          </div>
          <Button
            onClick={handleResearch}
            disabled={isResearching}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isResearching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Researching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Start Research
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Enter Company Names</CardTitle>
            <CardDescription>
              Add companies you want to research. The agent will search for sustainability data
              and generate reports in the same format as your uploaded files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Company Input Fields */}
            <div className="space-y-3">
              {companies.map((company, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={company}
                    onChange={(e) => handleCompanyChange(index, e.target.value)}
                    placeholder={`Company ${index + 1} (e.g., Tesla, Apple, Microsoft)`}
                    className="flex-1"
                    disabled={isResearching}
                  />
                  {companies.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCompany(index)}
                      disabled={isResearching}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Add More Button */}
            <Button
              variant="outline"
              onClick={handleAddCompany}
              disabled={isResearching}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Company
            </Button>

            {/* Information Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• The research agent will search the web for each company</li>
                <li>• Data will be collected for: emissions, investments, purchases, pilots, and environments</li>
                <li>• Reports will be generated in TXT format (same as uploaded files)</li>
                <li>• Files will be automatically uploaded to your project</li>
                <li>• You can then run analysis to see the results</li>
              </ul>
            </div>

            {/* Research Progress */}
            {isResearching && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">Researching companies...</p>
                    <p className="text-sm text-gray-600">
                      This may take a few minutes depending on the number of companies.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
