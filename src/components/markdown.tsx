'use client'

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = '' }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={className}
      components={{
        p: ({ node, ...props }) => <p className="mb-2" {...props} />,
        ul: ({ node, ...props }) => (
          <ul className="list-disc list-inside mb-2" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal list-inside mb-2" {...props} />
        ),
        code: ({ node, inline, ...props }) =>
          inline ? (
            <code className="bg-gray-200 px-1 rounded text-sm" {...props} />
          ) : (
            <code className="block bg-gray-100 p-2 rounded mb-2 overflow-x-auto text-sm" {...props} />
          ),
        a: ({ node, ...props }) => (
          <a className="text-blue-600 hover:underline" {...props} />
        ),
        h1: ({ node, ...props }) => (
          <h1 className="text-xl font-bold mb-2" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-lg font-semibold mb-2" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="font-semibold mb-2" {...props} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
