'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getStoredKey,
  setStoredKey,
  THEME_STORAGE,
  TEXT_MODELS,
  IMAGE_MODELS,
  type ThemeName,
} from '@/lib/client';
import { ThemeToggle } from './components/ui';
import { ChatTab } from './components/ChatTab';
import { AdminTab } from './components/AdminTab';
import { DocsTab } from './components/DocsTab';
import { SmokeCanvas } from './components/SmokeCanvas';

/* ================================================================
   page.tsx — Google Neural Expressive 布局 (完全参照你的 HTML)
   - 左侧可折叠历史记录 (Timeline)
   - 左上角悬浮胶囊控制区 (菜单 · 模型 · 设置)
   - 设置弹出面板 (Admin / API Docs / 明暗切换 / 登出)
   - 核心聊天区 (自适应宽度)
   ================================================================ */

type SettingsSection = 'admin' | 'api' | 'prefs';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [key, setKey] = useState('');
  const [theme, setTheme] = useState<ThemeName>('aurora');

  // 布局状态
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('prefs');
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  // 模型 & 图片参数 (传给 ChatTab)
  const [model, setModel] = useState('gpt-5.4-mini');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // 聊天历史
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; time: number }[]>([]);
  const [chatKey, setChatKey] = useState(0); // 切换会话来强制刷新 ChatTab

  // 初始化
  useEffect(() => {
    setMounted(true);
    const savedKey = getStoredKey();
    if (savedKey) setKey(savedKey);
    const savedTheme = (localStorage.getItem(THEME_STORAGE) as ThemeName) || 'aurora';
    setTheme(savedTheme);
    
    // 恢复聊天历史
    try {
      const raw = localStorage.getItem('ca_chat_history');
      if (raw) setChatHistory(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // 主题持久化
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE, theme);
  }, [theme, mounted]);

  // 聊天历史持久化
  useEffect(() => {
    if (!mounted || chatHistory.length === 0) return;
    localStorage.setItem('ca_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory, mounted]);

  // 点击外部关闭 popup
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node) &&
        settingsBtnRef.current &&
        !settingsBtnRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  // 点击外部关闭模型菜单
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelMenu]);

  const allModels = [...TEXT_MODELS, ...IMAGE_MODELS];
  const currentModelLabel = allModels.find((m) => m.id === model)?.label || model;

  function newChat() {
    // 保存当前会话到历史（通过 ChatTab 的 ref 或事件）
    setChatKey((k) => k + 1);
    setHistoryOpen(false);
  }

  function addToHistory(title: string) {
    setChatHistory((prev) => {
      const id = Date.now().toString(36);
      return [{ id, title, time: Date.now() }, ...prev.slice(0, 19)]; // 最多 20 条
    });
  }

  function logout() {
    setSettingsOpen(false);
    setStoredKey('');
    setKey('');
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="neural-spinner h-6 w-6" />
      </div>
    );
  }

  if (!key) {
    return (
      <LoginGate
        onLogin={setKey}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'aurora' ? 'daylight' : 'aurora'))}
      />
    );
  }

  return (
    <div className="app-container">
      {/* 生命体烟雾背景 */}
      <SmokeCanvas />

      {/* ============ 左侧可折叠历史记录 ============ */}
      <aside className={`history-sidebar ${historyOpen ? 'open' : ''}`}>
        <div className="history-title">Timeline</div>

        {/* 新会话按钮 */}
        <button
          onClick={newChat}
          className="flex items-center gap-2 w-full px-3 py-3 mb-3 rounded-2xl text-sm font-medium text-accent hover:bg-surface-2 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>

        {chatHistory.length === 0 && (
          <p className="text-xs text-muted px-2 py-6 text-center">No conversations yet</p>
        )}

        {chatHistory.map((h) => (
          <div
            key={h.id}
            className="history-item"
            onClick={() => {
              setChatKey((k) => k + 1);
              setHistoryOpen(false);
            }}
          >
            <p className="truncate text-sm">{h.title}</p>
            <p className="text-xs text-muted mt-1">
              {new Date(h.time).toLocaleDateString()}
            </p>
          </div>
        ))}
      </aside>

      {/* ============ 主聊天区 ============ */}
      <main className="main-chat">
        {/* ---- 左上角控制区 ---- */}
        <div className="top-controls">
          {/* 菜单按钮 */}
          <button
            className="capsule icon-btn interactive-capsule"
            onClick={() => setHistoryOpen((v) => !v)}
            title="Toggle History"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* 模型切换 */}
          <div className="relative" ref={modelMenuRef}>
            <button
              className="capsule model-switcher interactive-capsule"
              onClick={() => setShowModelMenu((v) => !v)}
            >
              {currentModelLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* 模型下拉菜单 */}
            {showModelMenu && (
              <div className="capsule absolute top-full left-0 mt-2 w-72 p-2 z-50 max-h-80 overflow-y-auto">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2">Text Models</p>
                {TEXT_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelMenu(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm transition-colors ${
                      model === m.id ? 'bg-surface-3 text-fg font-medium' : 'text-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    <span className="block">{m.label}</span>
                    <span className="text-xs text-muted">{m.desc}</span>
                  </button>
                ))}
                <p className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2 mt-2">Image Models</p>
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelMenu(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm transition-colors ${
                      model === m.id ? 'bg-surface-3 text-fg font-medium' : 'text-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    <span className="block">{m.label}</span>
                    <span className="text-xs text-muted">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 设置按钮 */}
          <button
            ref={settingsBtnRef}
            className="capsule icon-btn interactive-capsule"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* ---- 设置面板 ---- */}
          {settingsOpen && (
            <div ref={settingsRef} className="capsule settings-popup open">
              {/* 导航标签 */}
              <div className="flex gap-1 mb-4 p-1 bg-surface-2 rounded-2xl">
                {([
                  { key: 'prefs' as const, label: 'Preferences', icon: '⚙' },
                  { key: 'admin' as const, label: 'Admin', icon: '👥' },
                  { key: 'api' as const, label: 'API Docs', icon: '📄' },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setSettingsSection(tab.key)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                      settingsSection === tab.key
                        ? 'bg-surface-3 text-fg'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* 内容区 */}
              <div className="overflow-y-auto max-h-[60vh]">
                {settingsSection === 'prefs' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1 py-2">
                      <span className="text-sm font-medium">Theme</span>
                      <ThemeToggle
                        theme={theme}
                        onToggle={() => setTheme((t) => (t === 'aurora' ? 'daylight' : 'aurora'))}
                      />
                    </div>
                    <div className="border-t border-border pt-3">
                      <button
                        onClick={logout}
                        className="w-full py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-2xl transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}

                {settingsSection === 'admin' && (
                  <div className="-mx-2">
                    <AdminTab apiKey={key} />
                  </div>
                )}

                {settingsSection === 'api' && (
                  <div className="-mx-1">
                    <DocsTab />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---- 对话流 ---- */}
        <ChatTab key={chatKey} apiKey={key} model={model} onNewTitle={addToHistory} />
      </main>

      <style jsx global>{`
        /* ================================================================
           页面布局专用样式 (参照 HTML 的 Google Neural Expressive 布局)
           ================================================================ */
        .app-container {
          position: relative;
          z-index: 10;
          display: flex;
          width: 100vw;
          height: 100vh;
        }

        /* 左侧可折叠历史记录 */
        .history-sidebar {
          flex-shrink: 0;
          width: 280px;
          height: 100%;
          background: rgba(15, 15, 18, 0.75);
          border-right: 1px solid var(--border);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          margin-left: -280px;
          transition: margin-left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          z-index: 50;
        }
        .history-sidebar.open {
          margin-left: 0;
        }
        .history-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 20px;
          padding-left: 8px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }
        .history-item {
          padding: 14px 16px;
          margin-bottom: 8px;
          border-radius: 16px;
          cursor: pointer;
          transition: 0.2s;
        }
        .history-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        /* 主聊天区 */
        .main-chat {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        /* 通用悬浮胶囊 */
        .capsule {
          background: rgba(26, 26, 30, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }
        [data-theme='daylight'] .capsule {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(0, 0, 0, 0.08);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
        }

        .capsule:hover {
          border-color: rgba(255, 255, 255, 0.28);
        }
        [data-theme='daylight'] .capsule:hover {
          border-color: rgba(0, 0, 0, 0.15);
        }

        /* 左上角控制区 */
        .top-controls {
          position: absolute;
          top: 24px;
          left: 24px;
          display: flex;
          gap: 12px;
          z-index: 100;
          align-items: center;
        }

        .icon-btn {
          width: 48px;
          height: 48px;
          border-radius: 24px;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          color: var(--fg);
        }

        .model-switcher {
          height: 48px;
          padding: 0 20px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 500;
          cursor: pointer;
          font-size: 15px;
          color: var(--fg);
        }

        /* 设置面板 */
        .settings-popup {
          position: absolute;
          top: 60px;
          left: 0;
          width: 420px;
          max-width: calc(100vw - 48px);
          border-radius: 24px;
          padding: 20px;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-10px) scale(0.95);
          transform-origin: top left;
        }
        .settings-popup.open {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0) scale(1);
        }
      `}</style>
    </div>
  );
}

/* ================================================================
   LoginGate
   ================================================================ */
function LoginGate({
  onLogin,
  theme,
  onToggleTheme,
}: {
  onLogin: (key: string) => void;
  theme: ThemeName;
  onToggleTheme: () => void;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const token = input.trim();
    if (!token) return setError('Please enter an API Key');
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/auth/login-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error === 'invalid_key'
            ? 'Invalid API Key'
            : 'Login failed',
        );
      }
      setStoredKey(token);
      onLogin(token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 overflow-hidden">
      <SmokeCanvas />
      <div className="absolute inset-0 z-[1] opacity-20 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[600px] h-[600px] bg-neural-gradient rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      </div>
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="w-full max-w-[400px] z-10 animate-fade-in">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-neural-gradient text-white shadow-glow interactive-capsule">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-fg tracking-tight">Welcome Back</h1>
          <p className="mt-3 text-base text-muted">Authenticate to continue to chat-addition</p>
        </div>
        <div className="neural-card p-8 backdrop-blur-2xl bg-surface/80 interactive-capsule">
          <form onSubmit={login} className="space-y-6">
            <div className="space-y-1">
              <span className="text-sm font-medium text-fg">API Key</span>
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="sk-..."
                autoFocus
                className="w-full rounded-2xl bg-surface-2 px-4 py-4 text-base text-fg placeholder:text-muted/60 focus-ring transition-all border-none outline-none focus:bg-surface-3 font-mono"
              />
            </div>
            {error && (
              <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-in">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-accent text-accent-fg font-medium text-base interactive-capsule transition-all hover:shadow-glow disabled:opacity-50"
            >
              {loading ? <span className="neural-spinner h-5 w-5 mx-auto block" /> : 'Continue'}
            </button>
          </form>
        </div>
        <p className="mt-8 text-center text-sm text-muted/60">Securely stored in your browser's local storage.</p>
      </div>
    </div>
  );
}
