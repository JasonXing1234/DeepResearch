'use client'

import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Markdown } from '../markdown';
import { useResearch } from '@/contexts/ResearchContext';

const BASE_SYSTEM_PROMPT = `You are an intelligent ESG (Environmental, Social, and Governance) research assistant. You have access to data from:

1. **Project Management Results**: Analysis results from sustainability projects including project information and analysis findings.

2. **Deep Research Engine Data**: Automated web research datasets containing information about companies, their sustainability commitments, investments, equipment purchases, pilot projects, and environmental constraints.

When answering user questions:
- Provide insights based on the available data
- Be specific about companies, targets, and commitments
- Cite which data source you're using (project results or research data)
- Offer comparisons between companies when relevant
- Provide actionable insights based on the data
- If data is missing for a question, let the user know what information is available

Always be helpful, accurate, and focused on ESG and sustainability topics.`;

export function DashboardAssistant() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { queries } = useResearch();

  const systemPrompt = useMemo(() => {
    let fullPrompt = BASE_SYSTEM_PROMPT;

    // Add research data context if available
    if (queries.length > 0) {
      fullPrompt += '\n\n### Recent Research Data Available:\n';
      queries.slice(0, 2).forEach((query) => {
        fullPrompt += `- Companies: ${query.companies.join(', ')}\n`;
        fullPrompt += `  Date: ${query.created_at}, Status: ${query.status}\n`;
        if (query.datasets) {
          const datasets = [];
          if (query.datasets.emissions?.length) datasets.push('Emissions');
          if (query.datasets.investments?.length) datasets.push('Investments');
          if (query.datasets.purchases?.length) datasets.push('Purchases');
          if (query.datasets.pilots?.length) datasets.push('Pilots');
          if (query.datasets.environments?.length) datasets.push('Environments');
          if (datasets.length) {
            fullPrompt += `  Datasets: ${datasets.join(', ')}\n`;
          }
        }
      });
    } else {
      fullPrompt += '\n\n### Research Data:\nNo research queries have been performed yet.';
    }

    return fullPrompt;
  }, [queries]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    system: systemPrompt,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
              {queries.length > 0
                ? `Query insights from ${queries.length} research ${queries.length === 1 ? 'query' : 'queries'}`
                : 'Ask questions about ESG and sustainability topics'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Messages */}
        <ScrollArea className="flex-1 px-8 py-6">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-full max-w-3xl flex flex-col items-center justify-center gap-8">
                  <Card className="w-full border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-center gap-2 text-center">
                        <Sparkles className="h-6 w-6 text-blue-600" />
                        Ask about ESG Data
                      </CardTitle>
                      <CardDescription className="text-center">
                        Query insights from research and analysis data
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-gray-600">
                      <div>
                        <p className="font-medium text-gray-900 mb-3">Example questions:</p>
                        <ul className="space-y-2 list-disc list-inside">
                          <li>Which companies have net-zero targets?</li>
                          <li>Summarize investment announcements</li>
                          <li>Show me pilot projects by company</li>
                          <li>Compare emissions reduction commitments</li>
                          <li>What equipment purchases were identified?</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Input Section - Centered and Prominent */}
                  <form onSubmit={handleSubmit} className="w-full flex gap-3 px-4">
                    <Input
                      value={input}
                      onChange={handleInputChange}
                      placeholder="Ask about ESG data, companies, or research findings..."
                      disabled={isLoading}
                      className="flex-1 text-lg px-6 py-3 border-2 border-blue-200 focus:border-blue-600 focus:ring-blue-600"
                    />
                    <Button
                      type="submit"
                      disabled={isLoading || !(input ?? '').trim()}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-3 h-auto text-lg"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
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
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                      <p className="text-sm text-gray-600">Analyzing data...</p>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input - Always visible at bottom when there are messages */}
        {messages.length > 0 && (
          <div className="border-t border-gray-200 px-8 py-6 bg-gradient-to-r from-blue-50 to-transparent">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about ESG data, companies, or research findings..."
                disabled={isLoading}
                className="flex-1 text-lg px-6 py-3 border-2 border-blue-200 focus:border-blue-600 focus:ring-blue-600"
              />
              <Button
                type="submit"
                disabled={isLoading || !(input ?? '').trim()}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 h-auto text-lg"
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
