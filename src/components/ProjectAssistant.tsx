'use client'

import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Markdown } from './markdown';
import type { SustainabilityProject } from './SustainabilityDashboard';

interface ProjectAssistantProps {
  projects: SustainabilityProject[];
  selectedProjectId: string | null;
}

export function ProjectAssistant({
  projects,
  selectedProjectId,
}: ProjectAssistantProps) {
  const [projectContext, setProjectContext] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: {
      system: `You are a helpful assistant for sustainability data analysis. You have access to analysis results from sustainability projects.

When users ask about their projects, provide insights based on the data available. Be specific about:
- Companies and their sustainability commitments
- Analysis results (commitments, net-zero targets, investments, pilots, equipment, environments)
- Data from specific reports (emissions, investments, machine purchases, pilot projects, project environments)
- Recommendations based on the data

Always be helpful and provide actionable insights.`,
    },
  });

  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  
  useEffect(() => {
    const loadProjectContext = async () => {
      if (!selectedProjectId) {
        setProjectContext('');
        return;
      }

      try {
        const selectedProject = projects.find((p) => p.id === selectedProjectId);
        if (!selectedProject) return;

        let contextStr = `Current Project: ${selectedProject.name}\n`;
        if (selectedProject.description) {
          contextStr += `Description: ${selectedProject.description}\n`;
        }
        contextStr += `Status: ${selectedProject.analysis_status}\n`;

        
        if (selectedProject.analysis_status === 'completed') {
          const summaryResponse = await fetch(
            `/api/sustainability/results?projectId=${selectedProjectId}&type=summary`
          );
          const summaryData = await summaryResponse.json();

          if (summaryData.success && summaryData.results.length > 0) {
            contextStr += `\nAnalysis Results Summary:\n`;
            summaryData.results.forEach(
              (result: any) => {
                const attributes = [
                  result.commitment_to_reduce && 'Commitment to Reduce',
                  result.net_zero_target && 'Net-zero Target',
                  result.pilot && 'Pilot',
                  result.investment_announced && 'Investment Announced',
                  result.equipment_purchased && 'Equipment Purchased',
                  result.project_environment && 'Project Environment',
                ].filter(Boolean);

                contextStr += `\n${result.company_name}:\n`;
                if (attributes.length > 0) {
                  contextStr += `  - ${attributes.join(', ')}\n`;
                } else {
                  contextStr += '  - No attributes found\n';
                }
              }
            );
          }
        }

        setProjectContext(contextStr);
      } catch (error) {
        console.error('Error loading project context:', error);
      }
    };

    loadProjectContext();
  }, [selectedProjectId, projects]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      {}
      <div className="border-b border-gray-200 px-8 py-6">
        <h2 className="text-2xl font-bold text-gray-900">Project Assistant</h2>
        <p className="text-sm text-gray-600 mt-1">
          {selectedProject
            ? `Analyzing ${selectedProject.name}`
            : 'Select a project to get started'}
        </p>
      </div>

      {selectedProject ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {}
          <ScrollArea className="flex-1 px-8 py-6">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <Card className="w-96 border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle>Ask about your project</CardTitle>
                      <CardDescription>
                        Get insights from your sustainability analysis
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-gray-600">
                      <div>
                        <p className="font-medium text-gray-900 mb-2">Example questions:</p>
                        <ul className="space-y-1 list-disc list-inside">
                          <li>Which companies have net-zero targets?</li>
                          <li>Show me companies with investments</li>
                          <li>What equipment purchases were found?</li>
                          <li>Which companies have pilot projects?</li>
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
                    <p className="text-sm text-gray-600">Thinking...</p>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {}
          <div className="border-t border-gray-200 px-8 py-4">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about your sustainability analysis..."
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
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-96 border-0 shadow-lg">
            <CardContent className="pt-12">
              <p className="text-center text-gray-500 text-lg">
                Select a project to chat with the assistant
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
