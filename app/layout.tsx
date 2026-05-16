import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UAPI Pro MCP Server',
  description: 'UAPI 搜索 + ChatGPT session proxy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
