import { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, Sparkles, Search, FileText, Brain, ListChecks, Lightbulb, ClipboardList } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import type { Class, Lecture } from '../app/page';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolUsed?: string;
};

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

const mockResponses = [
  "Based on your lecture notes, let me help you with that. In your CS 101 lecture on 'Introduction to Programming', you learned that variables are containers for storing data values. They're fundamental because they allow us to store and manipulate data throughout our programs.",
  
  "Looking at your Calculus notes from the lecture on 'Limits and Continuity', a limit describes the value that a function approaches as the input approaches some value. The formal definition states that the limit of f(x) as x approaches a equals L if we can make f(x) arbitrarily close to L by making x sufficiently close to a.",
  
  "According to your English Composition lecture notes, a strong thesis statement should be specific, arguable, and focused. It should clearly state your position and give the reader a roadmap of your essay. For example, instead of 'Social media has effects on society,' you should write something like 'Social media has increased political polarization by creating echo chambers that reinforce existing beliefs.'",
  
  "From your Psychology 101 lecture on Cognitive Psychology, the Gestalt principles describe how we organize visual elements into groups. These include proximity (things close together are grouped), similarity (similar things are grouped), and closure (we fill in gaps to see complete forms).",
  
  "Great question! Let me search through your lecture transcripts to find relevant information about that topic.",
  
  "I can see from your Computer Science notes that algorithms are step-by-step procedures for solving problems. Big O notation is used to describe performance - O(n) means time grows linearly with input size, while O(1) represents constant time.",
];

export function StudyAssistant({ classes, lectures }: StudyAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI study assistant. I have access to all your lecture transcripts and can help you study, answer questions, or explain concepts from your classes. Use the tools menu to get started, or just ask me anything!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (toolUsed?: string) => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      toolUsed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
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

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200'
                  } rounded-2xl p-4`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-gray-500">AI Assistant</span>
                    </div>
                  )}
                  {message.role === 'user' && message.toolUsed && (
                    <div className="flex items-center gap-2 mb-2 opacity-80">
                      <span className="text-xs">
                        Used: {tools.find(t => t.id === message.toolUsed)?.name}
                      </span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

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
