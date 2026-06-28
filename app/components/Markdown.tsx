'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/** 代码块：带语言标签 + 复制按钮。 */
function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = (className || '').replace('language-', '') || 'code';
  const text = String(children ?? '').replace(/\n$/, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="group relative">
      <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-border bg-surface-2 px-4 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-muted transition hover:text-fg focus-ring rounded px-1 py-0.5"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              已复制
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              复制
            </>
          )}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none">{children}</pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }: any) => {
            const isBlock = String(children).includes('\n') || /language-/.test(className || '');
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
