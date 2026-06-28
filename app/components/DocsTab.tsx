'use client';

import React, { useState } from 'react';
import { Card, Badge } from './ui';
import { Markdown } from './Markdown';

type Endpoint = {
  method: 'GET' | 'POST';
  path: string;
  auth: boolean;
  desc: string;
  body?: string;
  sample: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    auth: true,
    desc: '对话补全，兼容 OpenAI 格式，支持流式 (stream) 与非流式。可自动识别图片生成模型。',
    body: `{
  "model": "gpt-5.4-mini",
  "stream": true,
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}`,
    sample: `curl -X POST $BASE/v1/chat/completions \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.4-mini","stream":true,"messages":[{"role":"user","content":"hi"}]}'`,
  },
  {
    method: 'POST',
    path: '/v1/images/generations',
    auth: true,
    desc: '文生图。同步等待，超时返回 503 + X-Image-Job-Id，需轮询 /v1/images/jobs/:id。',
    body: `{
  "model": "gpt-image-2",
  "prompt": "赛博朋克城市",
  "size": "1024x1024",
  "quality": "high",
  "n": 1,
  "response_format": "url"
}`,
    sample: `curl -X POST $BASE/v1/images/generations \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-image-2","prompt":"a cat"}'`,
  },
  {
    method: 'GET',
    path: '/v1/images/jobs/:jobId',
    auth: false,
    desc: '查询图片任务状态。succeeded/failed 状态公开访问。',
    sample: `curl $BASE/v1/images/jobs/imgjob_xxxx`,
  },
  {
    method: 'GET',
    path: '/v1/images/jobs/:jobId/files/:index',
    auth: false,
    desc: '下载图片文件，公开访问。originUrl 存在时 302 跳转，否则返回二进制。',
    sample: `curl -L $BASE/v1/images/jobs/imgjob_xxxx/files/0 -o out.png`,
  },
  {
    method: 'GET',
    path: '/auth/status',
    auth: true,
    desc: '获取所有会话状态、健康度统计。',
    sample: `curl $BASE/auth/status -H "Authorization: Bearer $KEY"`,
  },
  {
    method: 'POST',
    path: '/auth/login-check',
    auth: false,
    desc: '校验 API Key 是否有效（key 放在请求体）。',
    body: `{ "key": "your-api-key" }`,
    sample: `curl -X POST $BASE/auth/login-check \\
  -H "Content-Type: application/json" \\
  -d '{"key":"YOUR_KEY"}'`,
  },
  {
    method: 'POST',
    path: '/auth/session',
    auth: true,
    desc: '注入 / 更新 ChatGPT session JSON（需含 accessToken 或 sessionToken）。',
    sample: `curl -X POST $BASE/auth/session \\
  -H "Authorization: Bearer $KEY" \\
  -d @session.json`,
  },
  {
    method: 'POST',
    path: '/auth/session/:sid/toggle',
    auth: true,
    desc: '启用 / 禁用某个会话。',
    body: `{ "disabled": true }`,
    sample: `curl -X POST $BASE/auth/session/abcd1234/toggle \\
  -H "Authorization: Bearer $KEY" \\
  -d '{"disabled":true}'`,
  },
  {
    method: 'POST',
    path: '/auth/session/:sid/remove',
    auth: true,
    desc: '删除某个会话。',
    sample: `curl -X POST $BASE/auth/session/abcd1234/remove \\
  -H "Authorization: Bearer $KEY"`,
  },
  {
    method: 'GET',
    path: '/auth/sessions/download',
    auth: true,
    desc: '导出全部会话为 JSON 文件。',
    sample: `curl $BASE/auth/sessions/download \\
  -H "Authorization: Bearer $KEY" -o sessions.json`,
  },
  {
    method: 'GET',
    path: '/ping',
    auth: false,
    desc: '健康检查。',
    sample: `curl $BASE/ping`,
  },
];

const MODELS_DOC = `| 模型 | 类型 | 说明 |
| --- | --- | --- |
| \`gpt-5.4-mini\` | 文本 | 快速、默认推荐 |
| \`gpt-4o\` | 文本 | 通用对话 |
| \`gpt-5.5\` | 文本 | 更强能力 |
| \`auto\` | 文本 | 自动路由 |
| \`gpt-image-2\` | 图片 | 新一代文生图（推荐） |
| \`gpt-image-1\` | 图片 | 经典文生图 |`;

export function DocsTab() {
  return (
    <div className="mx-auto max-w-full space-y-4">
      {/* 鉴权说明 */}
      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-fg">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 7v6c0 5 4 9 9 9s9-4 9-9V7l-9-5z" /></svg>
          鉴权
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          受保护的接口需在请求头携带 API Key，三种方式任选其一：
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li className="flex gap-2"><code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">Authorization: Bearer &lt;key&gt;</code></li>
          <li className="flex gap-2"><code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">X-API-Key: &lt;key&gt;</code></li>
          <li className="flex gap-2"><code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">?key=&lt;key&gt;</code> URL 参数</li>
        </ul>
      </Card>

      {/* 模型清单 */}
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold text-fg">模型清单</h2>
        <Markdown content={MODELS_DOC} />
      </Card>

      {/* 接口列表 */}
      <div>
        <h2 className="mb-3 px-1 text-lg font-semibold text-fg">接口列表</h2>
        <div className="space-y-3">
          {ENDPOINTS.map((ep) => (
            <EndpointCard key={ep.method + ep.path} ep={ep} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const methodTone = ep.method === 'GET' ? 'tonal' : 'success';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <Badge tone={methodTone as any}>{ep.method}</Badge>
        <code className="font-mono text-sm text-fg">{ep.path}</code>
        {ep.auth ? (
          <Badge tone="warning">需鉴权</Badge>
        ) : (
          <Badge tone="tonal">公开</Badge>
        )}
      </div>
      <div className="px-5 py-4">
        <p className="mb-3 text-sm text-muted">{ep.desc}</p>
        {ep.body && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">请求体</p>
            <pre className="overflow-x-auto rounded-xl border border-border bg-[#0b0d16] p-4 font-mono text-xs leading-relaxed text-fg">
              <code>{ep.body}</code>
            </pre>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">示例</p>
          <pre className="overflow-x-auto rounded-xl border border-border bg-[#0b0d16] p-4 font-mono text-xs leading-relaxed text-fg">
            <code>{ep.sample}</code>
          </pre>
        </div>
      </div>
    </Card>
  );
}
