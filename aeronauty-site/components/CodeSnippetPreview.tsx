'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeSnippetPreviewProps {
  title: string;
  language: string;
  code: string;
  description: string;
}

export function CodeSnippetPreview({ title, language, code, description }: CodeSnippetPreviewProps) {
  return (
    <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        <p className="text-gray-600 text-sm mt-1">{description}</p>
      </div>
      <div className="p-6">
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1.5rem',
            borderRadius: '0.5rem',
            fontSize: '0.95rem',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

