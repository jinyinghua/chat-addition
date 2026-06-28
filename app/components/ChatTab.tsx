'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  IMAGE_BACKGROUNDS,
  isImageModel,
  authHeaders,
  streamChatCompletion,
  extractError,
  throwIfError,
  imageFileUrl,
  sleep,
  type ChatRole,
} from '@/lib/client';
import { Markdown } from './Markdown';

type Msg = {
  id: string;
  role: ChatRole;
  content: string;
  images?: string[];
  error?: string;
  streaming?: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function ChatTab({
  apiKey,
  model,
  onNewTitle,
  onMessagesChange,
  initialMessages,
}: {
  apiKey: string;
  model: string;
  onNewTitle?: (title: string) => void;
  onMessagesChange?: (messages: { id: string; role: 'user' | 'assistant'; content: string; images?: string[]; error?: string }[]) => void;
  initialMessages?: { id: string; role: 'user' | 'assistant'; content: string; images?: string[]; error?: string }[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasReportedTitle = useRef(false);

  const isImg = isImageModel(model);

  // 自动滚到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // 通知父组件消息变化
  useEffect(() => {
    if (onMessagesChange && messages.length > 0) {
      onMessagesChange(messages.map(({ id, role, content, images, error }) => ({ id, role, content, images, error })));
    }
  }, [messages, onMessagesChange]);

  // 首次对话记录标题
  useEffect(() => {
    if (hasReportedTitle.current) return;
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser && onNewTitle) {
      hasReportedTitle.current = true;
      onNewTitle(firstUser.content.slice(0, 40));
    }
  }, [messages, onNewTitle]);

  function patchMsg(id: string, fn: (m: Msg) => Msg) {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }

  function dispatchSmokeLoading(loading: boolean) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smoke-loading', { detail: { loading } }));
    }
  }

  async function sendText(text: string) {
    const userMsg: Msg = { id: uid(), role: 'user', content: text };
    const assistantMsg: Msg = { id: uid(), role: 'assistant', content: '', streaming: true };
    const history = [...messages, userMsg];
    setMessages([...history, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    dispatchSmokeLoading(true);

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          ...authHeaders(apiKey, { 'Content-Type': 'application/json' }),
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      await throwIfError(res, 'Chat request failed');

      await streamChatCompletion(
        res,
        (delta) => patchMsg(assistantMsg.id, (m) => ({ ...m, content: m.content + delta })),
        (err) => patchMsg(assistantMsg.id, (m) => ({ ...m, error: err })),
        controller.signal,
      );
      patchMsg(assistantMsg.id, (m) => ({ ...m, streaming: false }));
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        patchMsg(assistantMsg.id, (m) => ({ ...m, streaming: false, content: m.content || '_（Stopped）_' }));
      } else {
        patchMsg(assistantMsg.id, (m) => ({ ...m, streaming: false, error: err.message }));
      }
    } finally {
      setStreaming(false);
      dispatchSmokeLoading(false);
      abortRef.current = null;
    }
  }

  async function sendImage(prompt: string) {
    const userMsg: Msg = { id: uid(), role: 'user', content: prompt };
    const assistantMsg: Msg = { id: uid(), role: 'assistant', content: '', streaming: true };
    setMessages([...messages, userMsg, assistantMsg]);

    setStreaming(true);
    dispatchSmokeLoading(true);
    try {
      const res = await fetch('/v1/images/generations', {
        method: 'POST',
        headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          model,
          prompt,
          size: 'auto',
          quality: 'auto',
          background: 'auto',
          n: 1,
          response_format: 'url',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: { url?: string }[] };
        const urls = (data.data || []).map((d) => d.url).filter(Boolean) as string[];
        patchMsg(assistantMsg.id, (m) => ({
          ...m,
          streaming: false,
          images: urls,
          content: urls.map((u) => `![image](${u})`).join('\n\n'),
        }));
        return;
      }

      const jobId = res.headers.get('X-Image-Job-Id') || '';
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }
      if (res.status === 503 && jobId) {
        patchMsg(assistantMsg.id, (m) => ({ ...m, content: `_Generating image… (job ${jobId})_` }));
        await pollImageJob(jobId, assistantMsg.id, 1);
        return;
      }

      throw new Error(extractError(body, `Image request failed (${res.status})`));
    } catch (e) {
      patchMsg(assistantMsg.id, (m) => ({ ...m, streaming: false, error: (e as Error).message }));
    } finally {
      setStreaming(false);
      dispatchSmokeLoading(false);
    }
  }

  async function pollImageJob(jobId: string, msgId: string, n: number) {
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const r = await fetch(`/v1/images/jobs/${jobId}`, { headers: authHeaders(apiKey) });
      if (!r.ok) continue;
      const job = (await r.json()) as { status: string; error?: string };
      if (job.status === 'succeeded') {
        const urls = Array.from({ length: n }, (_, idx) => imageFileUrl(jobId, idx));
        patchMsg(msgId, (m) => ({
          ...m,
          streaming: false,
          images: urls,
          content: urls.map((u) => `![image](${u})`).join('\n\n'),
        }));
        return;
      }
      if (job.status === 'failed') {
        patchMsg(msgId, (m) => ({ ...m, streaming: false, error: job.error || 'Image generation failed' }));
        return;
      }
    }
    patchMsg(msgId, (m) => ({ ...m, streaming: false, error: 'Image generation timed out' }));
  }

  function submit() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    if (isImg) void sendImage(text);
    else void sendText(text);
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <>
      {/* ========== 消息流 ========== */}
      <div ref={scrollRef} className="chat-scroll">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center max-w-md animate-fade-in px-4">
              <h2 className="text-2xl font-medium text-fg mb-3">Hello, how can I help?</h2>
              <p className="text-base text-muted">
                {isImg ? 'Describe an image you want to generate.' : 'Select a model and start chatting.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8 py-4 max-w-3xl mx-auto w-full px-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
          </div>
        )}
      </div>

      {/* ========== 底部悬浮输入胶囊 ========== */}
      <div className="input-wrapper">
        <div className="capsule input-container interactive-capsule">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={isImg ? 'Describe the image…' : 'Send a message or generate image…'}
          />
          {streaming ? (
            <button className="stop-btn" onClick={stop}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!input.trim()}>
              Generate
            </button>
          )}
        </div>
      </div>

      {/* ========== 页面级样式 ========== */}
      <style jsx>{`
        /* 聊天滚动区 */
        .chat-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 100px 8vw 140px 8vw;
          display: flex;
          flex-direction: column;
        }

        /* 底部输入 */
        .input-wrapper {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 48px);
          max-width: 850px;
          z-index: 100;
        }

        .input-container {
          width: 100%;
          border-radius: 36px;
          padding: 8px 8px 8px 24px;
          display: flex;
          align-items: center;
        }

        .input-container input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--fg);
          font-size: 16px;
          outline: none;
          padding: 12px 0;
        }
        .input-container input::placeholder {
          color: var(--muted);
        }

        .send-btn {
          background: var(--fg);
          color: var(--bg);
          border: none;
          border-radius: 28px;
          padding: 14px 28px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: 0.2s;
          white-space: nowrap;
        }
        .send-btn:hover:not(:disabled) {
          transform: scale(1.04);
        }
        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .stop-btn {
          background: var(--danger);
          color: white;
          border: none;
          border-radius: 50%;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.2s;
        }
        .stop-btn:hover {
          transform: scale(1.08);
        }
      `}</style>
    </>
  );
}

/* ================================================================
   MessageBubble
   ================================================================ */
function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  if (isUser) {
    return (
      <div className="flex justify-end w-full">
        <div className="msg user capsule interactive-capsule" style={{ maxWidth: '85%' }}>
          {msg.content}
          {msg.images && msg.images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {msg.images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl">
                  <img src={url} alt={`gen-${i}`} className="w-full" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start w-full">
      <div className="min-w-0 flex-1" style={{ maxWidth: '95%' }}>
        {msg.error ? (
          <div className="msg ai capsule interactive-capsule text-danger">
            <p className="font-medium mb-1">Error</p>
            {msg.error}
          </div>
        ) : (
          <div className={`msg ai capsule interactive-capsule ${msg.streaming && !msg.content ? 'min-h-10' : ''}`}>
            {msg.streaming && !msg.content ? (
              <div className="flex items-center gap-3">
                <div className="neural-spinner h-4 w-4" />
                <span className="text-sm text-muted font-medium">Generating…</span>
              </div>
            ) : (
              <div className={msg.streaming ? 'typing-cursor' : ''}>
                <Markdown content={msg.content} />
              </div>
            )}
            {msg.images && msg.images.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {msg.images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-border shadow-sm">
                    <img src={url} alt={`gen-${i}`} className="w-full transition-transform duration-500 hover:scale-105" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 操作栏 */}
        {!msg.streaming && msg.content && (
          <div className="mt-2 flex items-center gap-1 px-2 opacity-0 hover:opacity-100 transition-opacity">
            <button
              onClick={copy}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-fg hover:bg-surface-2 transition-colors"
              title="Copy"
            >
              {copied ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
