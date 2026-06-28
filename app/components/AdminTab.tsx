'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  authHeaders,
  extractError,
  throwIfError,
} from '@/lib/client';
import {
  Button,
  Card,
  Field,
  Textarea,
  Badge,
  StatusPill,
  Spinner,
  Empty,
  IconButton,
} from './ui';

type SessionStatus = {
  sid: string;
  account_id: string;
  email: string;
  expires_at: number;
  error_count: number;
  last_error: string;
  disabled: boolean;
  is_expired: boolean;
  is_healthy: boolean;
};

type StatusResp = {
  device_id: string;
  total: number;
  healthy: number;
  sessions: SessionStatus[];
};

type Toast = { id: string; text: string; tone: 'success' | 'error' };

export function AdminTab({ apiKey }: { apiKey: string }) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionJson, setSessionJson] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/auth/status', { headers: authHeaders(apiKey) });
      await throwIfError(res, '加载失败');
      const data = (await res.json()) as StatusResp;
      setStatus(data);
    } catch (e) {
      pushToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function pushToast(text: string, tone: 'success' | 'error') {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  async function addSession() {
    const trimmed = sessionJson.trim();
    if (!trimmed) return pushToast('请输入 session JSON', 'error');
    try {
      JSON.parse(trimmed);
    } catch {
      return pushToast('JSON 格式有误', 'error');
    }
    try {
      const res = await fetch('/auth/session', {
        method: 'POST',
        headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
        body: trimmed,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extractError(data, '注入失败'));
      pushToast('session 已注入', 'success');
      setSessionJson('');
      setShowAdd(false);
      await load();
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function toggle(sid: string, disabled: boolean) {
    try {
      const res = await fetch(`/auth/session/${sid}/toggle`, {
        method: 'POST',
        headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ disabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extractError(data, '操作失败'));
      pushToast(disabled ? '已禁用' : '已启用', 'success');
      await load();
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function remove(sid: string) {
    try {
      const res = await fetch(`/auth/session/${sid}/remove`, {
        method: 'POST',
        headers: authHeaders(apiKey),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extractError(data, '删除失败'));
      pushToast('已删除', 'success');
      await load();
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function downloadAll() {
    try {
      const res = await fetch('/auth/sessions/download', { headers: authHeaders(apiKey) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(extractError(data, '导出失败'));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chatgpt_sessions.json';
      a.click();
      URL.revokeObjectURL(url);
      pushToast('已导出', 'success');
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  const sessions = status?.sessions || [];

  return (
    <div className="relative mx-auto max-w-full">
      {/* Toast */}
      <div className="fixed top-20 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass animate-fade-in rounded-xl px-4 py-2.5 text-sm shadow-card ${
              t.tone === 'success' ? 'text-success' : 'text-danger'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* 统计卡 */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="总会话" value={status?.total ?? 0} tone="tonal" />
        <StatCard label="健康" value={status?.healthy ?? 0} tone="success" />
        <StatCard label="异常" value={(status?.total ?? 0) - (status?.healthy ?? 0)} tone="danger" />
        <StatCard label="已禁用" value={sessions.filter((s) => s.disabled).length} tone="warning" />
      </div>

      {/* 工具栏 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-fg">会话列表</h2>
          {status?.device_id && (
            <Badge tone="tonal">device: {status.device_id.slice(0, 8)}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner /> : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5" /></svg>
            )}
            刷新
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadAll}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            导出
          </Button>
          <Button variant="neural" size="sm" onClick={() => setShowAdd((v) => !v)}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            注入 session
          </Button>
        </div>
      </div>

      {/* 注入面板 */}
      {showAdd && (
        <Card className="mb-6 p-5 animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-fg">注入 ChatGPT session</h3>
            <IconButton onClick={() => setShowAdd(false)} className="h-7 w-7">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </IconButton>
          </div>
          <Field hint="粘贴完整的 session JSON，需包含 accessToken 或 sessionToken">
            <Textarea
              value={sessionJson}
              onChange={(e) => setSessionJson(e.target.value)}
              rows={7}
              placeholder={'{\n  "accessToken": "...",\n  "user": { ... }\n}'}
              className="font-mono text-xs"
            />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>取消</Button>
            <Button variant="neural" size="sm" onClick={addSession}>保存</Button>
          </div>
        </Card>
      )}

      {/* 会话网格 */}
      {loading && !status ? (
        <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-accent" /></div>
      ) : sessions.length === 0 ? (
        <Empty
          icon={<svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>}
          title="暂无会话"
          hint="点击「注入 session」添加你的第一个 ChatGPT 会话"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => {
            const tone = s.disabled ? 'warning' : s.is_expired ? 'danger' : s.is_healthy ? 'success' : 'danger';
            const label = s.disabled ? '已禁用' : s.is_expired ? '已过期' : s.is_healthy ? '健康' : '异常';
            return (
              <Card key={s.sid} className="p-4 flex flex-col gap-3 transition hover:shadow-glow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-fg">{s.email || s.account_id || s.sid}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">sid: {s.sid}</p>
                  </div>
                  <StatusPill tone={tone as any} label={label} />
                </div>

                <div className="space-y-1 text-xs text-muted">
                  {s.account_id && (
                    <div className="flex justify-between gap-2">
                      <span>account</span>
                      <span className="truncate font-mono text-fg/80">{s.account_id.slice(0, 16)}…</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>错误次数</span>
                    <span className={s.error_count > 0 ? 'text-danger' : 'text-fg/80'}>{s.error_count}</span>
                  </div>
                  {s.expires_at > 0 && (
                    <div className="flex justify-between">
                      <span>过期时间</span>
                      <span className="text-fg/80">{new Date(s.expires_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {s.last_error && (
                  <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger line-clamp-2 break-all">
                    {s.last_error}
                  </p>
                )}

                  <div className="mt-auto flex gap-2 pt-1">
                    <Button
                      variant={s.disabled ? 'tonal' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => void toggle(s.sid, !s.disabled)}
                    >
                    {s.disabled ? '启用' : '禁用'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void remove(s.sid)}>
                    删除
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'tonal' | 'success' | 'danger' | 'warning' }) {
  const colorMap = {
    tonal: 'text-fg',
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
  };
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[tone]}`}>{value}</p>
    </Card>
  );
}
