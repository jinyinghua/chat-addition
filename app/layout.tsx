import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'chat-addition · Playground',
  description: 'ChatGPT 中转 · 会话管理 · 图片生成 — 高级优雅的前端控制台',
};

// 通过 next/font/google 加载谷歌字体（带 CSS 变量）
const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-outfit',
  display: 'swap',
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: true,
});

// 在 React 注水前设置主题，避免页面加载时的主题闪烁。
const themeInitScript = `(function(){try{var t=localStorage.getItem('ca_theme');if(t!=='aurora'&&t!=='daylight'){t='aurora';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','aurora');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      data-theme="aurora"
      suppressHydrationWarning
      className={`${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
