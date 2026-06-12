'use client';

import { useEffect, useMemo, useState } from 'react';

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

const KEY_STORAGE = '_uapi_proxy_key';

export default function Page() {
  const [key, setKey] = useState('');
  const [loginInput, setLoginInput] = useState('');
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [sessionJson, setSessionJson] = useState('');
  const [message, setMessage] = useState('');
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }), [key]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(KEY_STORAGE) || '';
    if (saved) {
      setKey(saved);
      setLoginInput(saved);
      void loadStatus(saved);
    }
  }, []);

  async function loadStatus(token = key) {
    const res = await fetch('/auth/status', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      setMessage('认证失败');
      return;
    }
    const data = (await res.json()) as StatusResp;
    setStatus(data);
  }

  async function login() {
    const token = loginInput.trim();
    if (!token) return setMessage('请输入 API Key');
    const res = await fetch('/auth/login-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: token }),
    });
    if (!res.ok) return setMessage('登录失败');
    window.sessionStorage.setItem(KEY_STORAGE, token);
    setKey(token);
    setMessage('已连接');
    await loadStatus(token);
  }

  function logout() {
    window.sessionStorage.removeItem(KEY_STORAGE);
    setKey('');
    setStatus(null);
  }

  async function addSession() {
    const res = await fetch('/auth/session', {
      method: 'POST',
      headers: authHeaders,
      body: sessionJson,
    });
    const data = await res.json();
    setMessage(JSON.stringify(data));
    await loadStatus();
  }

  async function toggleSession(sid: string, disabled: boolean) {
    const res = await fetch(`/auth/session/${sid}/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ disabled }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? (data.message || '操作成功') : (data.detail || data.error?.message || '操作失败'));
    if (res.ok) await loadStatus();
  }

  async function removeSession(sid: string) {
    const res = await fetch(`/auth/session/${sid}/remove`, { method: 'POST', headers: authHeaders });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? (data.message || '删除成功') : (data.detail || data.error?.message || '删除失败'));
    if (res.ok) await loadStatus();
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>chat-addition</h1>
      <p>ChatGPT 中转 + 会话管理 + MCP 搜索</p>

      {!key ? (
        <section style={{ marginTop: 24 }}>
          <h2>登录</h2>
          <input value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="API Key" style={{ width: '100%', padding: 8 }} />
          <button onClick={login} style={{ marginTop: 8 }}>登录</button>
        </section>
      ) : (
        <section style={{ marginTop: 24 }}>
          <button onClick={logout}>退出</button>
          <button onClick={() => loadStatus()} style={{ marginLeft: 8 }}>刷新</button>
          <div style={{ marginTop: 16 }}>Device: {status?.device_id || '-'}</div>
          <div>总数: {status?.total ?? 0} / 健康: {status?.healthy ?? 0}</div>

          <section style={{ marginTop: 24 }}>
            <h2>注入 session</h2>
            <textarea value={sessionJson} onChange={(e) => setSessionJson(e.target.value)} rows={6} style={{ width: '100%', padding: 8 }} />
            <button onClick={addSession} style={{ marginTop: 8 }}>保存</button>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>会话列表</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">SID</th>
                  <th align="left">Account</th>
                  <th align="left">Email</th>
                  <th align="left">状态</th>
                  <th align="left">操作</th>
                </tr>
              </thead>
              <tbody>
                {status?.sessions.map((s) => (
                  <tr key={s.sid}>
                    <td>{s.sid}</td>
                    <td>{s.account_id || '-'}</td>
                    <td>{s.email || '-'}</td>
                    <td>{s.disabled ? '禁用' : s.is_healthy ? '健康' : '异常'}</td>
                    <td>
                      <button onClick={() => toggleSession(s.sid, !s.disabled)}>{s.disabled ? '启用' : '禁用'}</button>
                      <button onClick={() => removeSession(s.sid)} style={{ marginLeft: 8 }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>
      )}

      <p style={{ marginTop: 24, color: '#666' }}>{message}</p>
      <section style={{ marginTop: 24 }}>
        <h2>API</h2>
        <ul>
          <li>POST /v1/chat/completions</li>
          <li>POST /v1/images/generations</li>
          <li>GET /auth/status</li>
          <li>POST /auth/session</li>
        </ul>
      </section>
    </main>
  );
}
