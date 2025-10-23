'use client'

import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Markdown } from '../markdown';
import { useResearch } from '@/contexts/ResearchContext';

const BASE_SYSTEM_PROMPT = `You are an intelligent ESG (Environmental, Social, and Governance) research assistant. You have access to two types of data:

1. **Project Management Results**: Analysis results from sustainability projects including normalized data, detailed findings, and diagnostics for specific companies.

2. **Deep Research Engine Data**: Automated web research datasets containing:
   - Emissions Reductions: Companies' commitments to reduce emissions and net-zero targets
   - Investments & Commitments: Investment announcements and financial commitments
   - Equipment Purchases: Machine and equipment purchases for sustainability initiatives
   - Pilot Projects: Ongoing or completed pilot programs
   - Environmental Constraints: Environmental challenges and project requirements

When answering user questions:
- Provide insights based on the available data from both sources
- Be specific about companies, targets, and commitments
- Cite which data source you're using (project results or research data)
- Offer comparisons between companies when relevant
- Provide actionable insights based on the data
- If data is missing for a question, let the user know what information is available

Always be helpful, accurate, and focused on ESG and sustainability topics.`;

export function DashboardAssistant() {
  const [projectContext, setProjectContext] = useState<string>('');
  const [researchContext, setResearchContext] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { queries } = useResearch();

  const buildSystemPrompt = () => {
    let fullPrompt = BASE_SYSTEM_PROMPT;
    if (projectContext) {
      fullPrompt += `\n\n---\n### Available Project Data:\n${projectContext}`;
    }
    if (researchContext) {
      fullPrompt += `\n\n---\n### Available Research Data:\n${researchContext}`;
    }
    return fullPrompt;
  };

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    system: buildSystemPrompt(),
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load project context
  useEffect(() => {
    const loadProjectContext = async () => {
      try {
        const response = await fetch('/api/sustainability/projects');
        if (!response.ok) return;

        const data = await response.json();
        if (!data.success || !data.projects || data.projects.length === 0) {
          setProjectContext('No projects available.');
          return;
        }

        let contextStr = 'Available Projects:\n';
        for (const project of data.projects) {
          contextStr += `\n- ${project.name}`;
          if (project.description) {
            contextStr += ` (${project.description})`;
          }
          contextStr += `\n  Status: ${project.analysis_status}`;

          // Load analysis results for each project
          if (project.analysis_status === 'completed') {
            const resultsResponse = await fetch(
              `/api/sustainability/results?projectId=${project.id}`
            );
            if (resultsResponse.ok) {
              const resultsData = await resultsResponse.json();
              if (resultsData.success && resultsData.results && resultsData.results.length > 0) {
                contextStr += `\n  Results Summary:`;
                resultsData.results.forEach((result: any) => {
                  const attributes = [
                    result.commitment_to_reduce && 'Commitment to Reduce',
                    result.net_zero_target && 'Net-zero Target',
                    result.pilot && 'Pilot Projects',
                    result.investment_announced && 'Investment Announced',
                    result.equipment_purchased && 'Equipment Purchased',
                    result.project_environment && 'Project Environment',
                  ].filter(Boolean);

                  contextStr += `\n    ${result.company_name}: ${attributes.join(', ') || 'No specific attributes found'}`;
                });
              }
            }
          }
        }

        setProjectContext(contextStr);
      } catch (error) {
        console.error('Error loading project context:', error);
        setProjectContext('Error loading project data.');
      }
    };

    loadProjectContext();
  }, []);

  // Load research context
  useEffect(() => {
    if (queries.length === 0) {
      setResearchContext('No research data available yet.');
      return;
    }

    let contextStr = 'Recent Research Data:\n';
    queries.slice(0, 3).forEach((query) => {
      contextStr += `\n\nResearch Query (${query.created_at}):`;
      contextStr += `\nCompanies: ${query.companies.join(', ')}`;
      contextStr += `\nStatus: ${query.status}`;

      if (query.datasets) {
        if (query.datasets.emissions && query.datasets.emissions.length > 0) {
          contextStr += `\n  Emissions Data: ${JSON.stringify(query.datasets.emissions)}`;
        }
        if (query.datasets.investments && query.datasets.investments.length > 0) {
          contextStr += `\n  Investment Data: ${JSON.stringify(query.datasets.investments)}`;
        }
        if (query.datasets.purchases && query.datasets.purchases.length > 0) {
          contextStr += `\n  Equipment Purchases: ${JSON.stringify(query.datasets.purchases)}`;
        }
        if (query.datasets.pilots && query.datasets.pilots.length > 0) {
          contextStr += `\n  Pilot Projects: ${JSON.stringify(query.datasets.pilots)}`;
        }
        if (query.datasets.environments && query.datasets.environments.length > 0) {
          contextStr += `\n  Environmental Data: ${JSON.stringify(query.datasets.environments)}`;
        }
      }
    });

    setResearchContext(contextStr);
  }, [queries]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">ESG Research Assistant</h2>
            <p className="text-sm text-gray-600 mt-1">
              Query insights from both project analysis and deep research data
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Messages */}
        <ScrollArea className="flex-1 px-8 py-6">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <Card className="w-full max-w-lg border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-blue-600" />
                      Ask about ESG Data
                    </CardTitle>
                    <CardDescription>
                      Query insights from project analysis and research
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-gray-600">
                    <div>
                      <p className="font-medium text-gray-900 mb-2">Example questions:</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>Which companies have net-zero targets?</li>
                        <li>Summarize investment announcements across research</li>
                        <li>Show me pilot projects by company</li>
                        <li>Compare emissions reduction commitments</li>
                        <li>What equipment has been purchased for sustainability?</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-2xl rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm">{message.content}</p>
                    ) : (
                      <Markdown className="text-sm prose prose-sm max-w-none dark:prose-invert">
                        {message.content}
                      </Markdown>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                  <p className="text-sm text-gray-600">Analyzing data...</p>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-gray-200 px-8 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about ESG data, companies, or research findings..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Debug info (hidden by default, visible for development) */}
      {(projectContext || researchContext) && (
        <div className="hidden">
          <textarea value={projectContext} readOnly />
          <textarea value={researchContext} readOnly />
        </div>
      )}
    </div>
  );
}
