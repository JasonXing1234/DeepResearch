'use client'

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Send, Loader2, Sparkles, Bot, User, FileText } from 'lucide-react';
import { Markdown } from '../markdown';
import { useResearch } from '@/contexts/ResearchContext';
import { toast } from 'sonner';

const BASE_SYSTEM_PROMPT = `You are an intelligent Leads research assistant. You have access to data from:

1. **Project Management Results**: Analysis results from sustainability projects including project information and analysis findings.

2. **Deep Research Engine Data**: Automated web research datasets containing information about companies, their sustainability commitments, investments, equipment purchases, pilot projects, and environmental constraints.

When answering user questions:
- Provide insights based on the available data
- Be specific about companies, targets, and commitments
- Cite which data source you're using (project results or research data)
- Offer comparisons between companies when relevant
- Provide actionable insights based on the data
- If data is missing for a question, let the user know what information is available

Always be helpful, accurate, and focused on Leads and sustainability topics.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    company?: string;
    category?: string;
    content: string;
    similarity?: number;
  }>;
}

export function DashboardAssistant() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { queries } = useResearch();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    
    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/research-chat-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to get response');
        setMessages(newMessages);
        return;
      }

      
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: data.message,
          sources: data.sources,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Error sending message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      {}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI Research Assistant</h2>
            <p className="text-sm text-gray-600 mt-1">
              {queries.length > 0
                ? `Ask questions about ${queries.length} research ${queries.length === 1 ? 'project' : 'projects'}`
                : 'Ask questions about your research data'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {}
        <ScrollArea className="flex-1 px-8 py-6">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-full max-w-3xl flex flex-col items-center justify-center gap-8">
                  <Card className="w-full border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-center gap-2 text-center">
                        <Sparkles className="h-6 w-6 text-blue-600" />
                        Ask about Leads Data
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

                  {}
                  <div className="w-full flex gap-3 px-4">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask about your research data..."
                      disabled={isLoading}
                      className="flex-1 text-lg px-6 py-3 border-2 border-purple-200 focus:border-purple-600 focus:ring-purple-600"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={isLoading || !input.trim()}
                      className="bg-purple-600 hover:bg-purple-700 px-6 py-3 h-auto text-lg"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-purple-600" />
                      </div>
                    )}

                    <div
                      className={`flex flex-col gap-2 max-w-[80%] ${
                        message.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        {message.role === 'user' ? (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <Markdown className="text-sm prose prose-sm max-w-none dark:prose-invert">
                            {message.content}
                          </Markdown>
                        )}
                      </div>

                      {}
                      {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                        <div className="text-xs text-gray-500 space-y-1">
                          <p className="font-medium flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Sources:
                          </p>
                          {message.sources.map((source, sourceIdx) => (
                            <div key={sourceIdx} className="pl-4 border-l-2 border-gray-200">
                              <p className="font-medium">
                                {source.company && `${source.company} - `}
                                {source.category && <span className="capitalize">{source.category}</span>}
                              </p>
                              <p className="text-gray-400 line-clamp-2">{source.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="bg-gray-100 rounded-lg px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {}
        {messages.length > 0 && (
          <div className="border-t border-gray-200 px-8 py-6 bg-gradient-to-r from-purple-50 to-transparent">
            <div className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your research data..."
                disabled={isLoading}
                className="flex-1 text-lg px-6 py-3 border-2 border-purple-200 focus:border-purple-600 focus:ring-purple-600"
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 h-auto text-lg"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
