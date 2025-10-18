import { useState, useRef, useEffect } from 'react';
import {
  Send, BookOpen, Sparkles, Search, FileText, Brain,
  ListChecks, Lightbulb, ClipboardList
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { useChat } from '@ai-sdk/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import type { Class, Lecture } from '../app/page';

type StudyAssistantProps = {
  classes: Class[];
  lectures: Lecture[];
};

type Tool = {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  prompt: string;
};

const tools: Tool[] = [
  {
    id: 'search',
    name: 'Search Lectures',
    icon: Search,
    description: 'Search through all your lecture transcripts for specific topics or keywords',
    prompt: 'Search my lectures for: ',
  },
  {
    id: 'summarize',
    name: 'Summarize',
    icon: FileText,
    description: 'Create concise summaries of lecture content or specific topics',
    prompt: 'Summarize my notes on: ',
  },
  {
    id: 'quiz',
    name: 'Create Quiz',
    icon: ListChecks,
    description: 'Generate practice questions and quizzes from your lecture material',
    prompt: 'Create a quiz on: ',
  },
  {
    id: 'flashcards',
    name: 'Generate Flashcards',
    icon: Brain,
    description: 'Create flashcards for key concepts and definitions',
    prompt: 'Generate flashcards for: ',
  },
  {
    id: 'study-guide',
    name: 'Study Guide',
    icon: ClipboardList,
    description: 'Build comprehensive study guides for upcoming exams',
    prompt: 'Create a study guide for: ',
  },
  {
    id: 'explain',
    name: 'Explain Concept',
    icon: Lightbulb,
    description: 'Get detailed explanations of complex concepts from your lectures',
    prompt: 'Explain the concept of: ',
  },
];

export function StudyAssistant({ classes, lectures }: StudyAssistantProps) {
  const { error, status, sendMessage, messages, regenerate, stop } = useChat();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("UPDATED MESSAGE", messages);
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ✅ helper: safely extract text from any message format
  const extractTextFromMessage = (message: any): string => {
    const textParts: string[] = [];

    // 1️⃣ Normal text message
    if (message.parts) {
      for (const part of message.parts) {
        if (part.type === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
        }

        // 2️⃣ Handle nested tool outputs
        if (part.type?.startsWith('tool-') && part.output) {
          const output = part.output;

          // handle { output: { type: "message", content: [...] } }
          if (output.content && Array.isArray(output.content)) {
            for (const c of output.content) {
              if (c.type === 'text') {
                // handle both text and result props
                textParts.push(c.text || c.result || '');
              }
            }
          }

          // handle { output: { type: "content", parts: [...] } }
          if (output.parts && Array.isArray(output.parts)) {
            for (const p of output.parts) {
              if (p.type === 'text') {
                textParts.push(p.text || p.result || '');
              }
            }
          }
        }
      }
    }

    return textParts.join('\n\n');
  };

  const handleSend = async (toolUsed?: string) => {
    if (!input.trim()) return;
    setInput('');
    setIsTyping(true);
    await sendMessage({ text: input });
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToolClick = (tool: Tool) => {
    setInput(tool.prompt);
    setToolsOpen(false);
  };

  const suggestedQuestions = [
    "Explain the concept of variables from my CS lecture",
    "What are the Gestalt principles in psychology?",
    "Help me understand limits and continuity",
    "How do I write a strong thesis statement?",
  ];

  return (
    <div className="h-full flex bg-gradient-to-b from-blue-50 to-white">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1>AI Study Assistant</h1>
              <p className="text-sm text-gray-500">
                Connected to {lectures.length} lecture transcripts across {classes.length} classes
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-red-500 text-center">
            <p>An error occurred.</p>
            <button
              type="button"
              className="px-4 py-2 mt-2 text-blue-500 border border-blue-500 rounded-md"
              onClick={() => regenerate()}
            >
              Retry
            </button>
          </div>
        )}
        {/* Messages */}
        <ScrollArea className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => {
              const text = extractTextFromMessage(message);
              if (!text) return null;

              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] ${message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200'
                      } rounded-2xl p-4`}
                  >
                    {message.role !== 'user' && (
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-gray-500">AI Assistant</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{text}</p>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                    <span className="text-sm text-gray-500">Searching your notes...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Suggested Questions (only show when conversation is new) */}
            {messages.length <= 1 && (
              <div className="pt-4">
                <p className="text-sm text-gray-500 mb-3">Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestions.map((question, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-gray-100 py-2 px-3"
                      onClick={() => setInput(question)}
                    >
                      {question}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white p-6">
          <div className="max-w-3xl mx-auto">
            <Card className="p-4">
              <div className="flex gap-3">
                <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-0"
                    align="start"
                    side="top"
                  >
                    <div className="p-3 border-b border-gray-200">
                      <h3 className="text-sm">Study Tools</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Select a tool to help you study
                      </p>
                    </div>
                    <ScrollArea className="max-h-96">
                      <div className="p-2">
                        {tools.map((tool) => {
                          const Icon = tool.icon;
                          return (
                            <button
                              key={tool.id}
                              onClick={() => handleToolClick(tool)}
                              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                            >
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Icon className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm">{tool.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {tool.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about your lectures..."
                  className="min-h-[60px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isTyping}
                  size="icon"
                  className="flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
                {(status === 'submitted' || status === 'streaming') && (
                    <div className="mt-4 text-gray-500">
                      {status === 'submitted' && <div>Loading...</div>}
                      <button
                        type="button"
                        className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
                        onClick={stop}
                      >
                        Stop
                      </button>
                    </div>
                  )}
              </div>
            </Card>
            <p className="text-xs text-gray-500 text-center mt-2">
              Click <Sparkles className="w-3 h-3 inline" /> for tools • Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* Tools Sidebar */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="mb-1">Study Tools</h2>
          <p className="text-sm text-gray-500">
            Use these tools to enhance your studying
          </p>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card
                  key={tool.id}
                  className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleToolClick(tool)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm mb-1">{tool.name}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-gray-200">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-blue-900">Tip</p>
            </div>
            <p className="text-xs text-blue-700">
              Click any tool to start using it in your conversation, or type naturally to ask questions!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
