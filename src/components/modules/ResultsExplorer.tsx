'use client'

import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

const MOCK_SUMMARY = [
  {
    company: 'Apple',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: true,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
  {
    company: 'Microsoft',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: true,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
  {
    company: 'Google',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: false,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
];

const MOCK_DETAILS = [
  {
    customer: 'Apple',
    attribute: 'Commitment to Reduce',
    yes_no: 'Yes',
    text: 'Apple committed to reducing carbon footprint by 75% by 2030',
    source: 'emissions',
    url: 'https://apple.com/environment',
  },
  {
    customer: 'Apple',
    attribute: 'Net-zero Target',
    yes_no: 'Yes',
    text: 'Carbon neutral by 2030 for Scope 1 and 2 emissions',
    source: 'emissions',
    url: 'https://apple.com/environment',
  },
  {
    customer: 'Microsoft',
    attribute: 'Investment Announced',
    yes_no: 'Yes',
    text: '$10 billion innovation fund for carbon removal technologies',
    source: 'investments',
    url: 'https://microsoft.com/climate',
  },
  {
    customer: 'Google',
    attribute: 'Equipment Purchased',
    yes_no: 'Yes',
    text: 'Purchased renewable energy equipment for data centers',
    source: 'purchases',
    url: 'https://google.com/sustainability',
  },
];

const MOCK_DIAGNOSTICS = [
  {
    company: 'Apple',
    emissions: 3,
    investments: 2,
    purchases: 4,
    pilots: 2,
    environments: 3,
  },
  {
    company: 'Microsoft',
    emissions: 4,
    investments: 5,
    purchases: 3,
    pilots: 3,
    environments: 2,
  },
  {
    company: 'Google',
    emissions: 3,
    investments: 3,
    purchases: 4,
    pilots: 0,
    environments: 4,
  },
];

export function ResultsExplorer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('normalized');

  const filteredSummary = MOCK_SUMMARY.filter((item) =>
    item.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDetails = MOCK_DETAILS.filter(
    (item) =>
      item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.attribute.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDiagnostics = MOCK_DIAGNOSTICS.filter((item) =>
    item.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownloadCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((header) => `"${row[header] || ''}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Results Explorer</h2>
            <p className="text-gray-600 mt-1">
              View and analyze ESG research results in multiple formats
            </p>
          </div>
          <Button
            onClick={() => handleDownloadCSV(filteredSummary, 'results.csv')}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search companies or attributes..."
          className="max-w-md"
        />
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="bg-white border-b border-gray-200 px-8 pt-6">
            <TabsList>
              <TabsTrigger value="normalized">Normalized View</TabsTrigger>
              <TabsTrigger value="details">Original View</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            {/* Normalized View */}
            <TabsContent value="normalized" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Summary by Company</CardTitle>
                  <CardDescription>
                    One row per company with six ESG attributes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Company</th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Commitment to Reduce
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Net-zero Target
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Pilot
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Investment Announced
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Equipment Purchased
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Project Environment
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredSummary.map((row) => (
                          <tr key={row.company} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {row.company}
                            </td>
                            {[
                              'commitment_to_reduce',
                              'net_zero_target',
                              'pilot',
                              'investment_announced',
                              'equipment_purchased',
                              'project_environment',
                            ].map((attr) => (
                              <td key={attr} className="px-4 py-3 text-center">
                                {row[attr as keyof typeof row] ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    No
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Details View */}
            <TabsContent value="details" className="mt-0">
              <div className="space-y-4">
                {filteredDetails.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-12">
                      <p className="text-center text-gray-500">
                        No details found for "{searchTerm}"
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredDetails.map((item, idx) => (
                    <Card key={idx} className="border-0 shadow-sm">
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Customer</p>
                            <p className="text-lg font-semibold text-gray-900">{item.customer}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Attribute</p>
                            <p className="text-lg font-semibold text-gray-900">{item.attribute}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Yes/No</p>
                            <p className="font-medium text-green-600">{item.yes_no}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Source</p>
                            <p className="text-sm text-gray-700 capitalize">{item.source}</p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Text</p>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                            {item.text}
                          </p>
                        </div>

                        {item.url && (
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                              Source URL
                            </p>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
                            >
                              {item.url}
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Diagnostics View */}
            <TabsContent value="diagnostics" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Diagnostics by Company</CardTitle>
                  <CardDescription>
                    Count of records per company per report type
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Company</th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Emissions
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Investments
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Purchases
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Pilots
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">
                            Environments
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-gray-900">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredDiagnostics.map((row) => (
                          <tr key={row.company} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {row.company}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.emissions}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.investments}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.purchases}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.pilots}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.environments}</td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-900">
                              {row.emissions + row.investments + row.purchases + row.pilots + row.environments}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
