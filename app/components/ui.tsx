'use client';

/**
 * 共享原子组件：Button / IconButton / Card / Badge / Pill / Field / Spinner / Empty。
 * Google Neural Expressive 设计语言：有机形态、大圆角、Tonal 表面、发光效果。
 */
import React from 'react';

type BtnVariant = 'neural' | 'ghost' | 'tonal' | 'danger';

const btnBase =
  'inline-flex items-center justify-center gap-2 font-medium text-sm transition-all select-none focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

const btnSizes: Record<string, string> = {
  sm: 'px-4 py-2 text-xs rounded-full',
  md: 'px-5 py-2.5 rounded-full',
  lg: 'px-6 py-3 text-[0.95rem] rounded-full',
};

const btnVariants: Record<BtnVariant, string> = {
  neural: 'btn-neural',
  ghost:
    'bg-transparent text-fg hover:bg-surface-2 rounded-full',
  tonal: 'bg-surface-2 text-fg hover:bg-surface-3 rounded-full',
  danger:
    'bg-danger/10 text-danger hover:bg-danger/20 rounded-full',
};

export function Button({
  variant = 'tonal',
  size = 'md',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
}) {
  return (
    <button
      className={`${btnBase} ${btnSizes[size]} ${btnVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-muted transition-colors hover:text-fg hover:bg-surface-2 focus-ring ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`neural-card ${className}`} {...props}>
      {children}
    </div>
  );
}

export type BadgeTone = 'neural' | 'tonal' | 'success' | 'danger' | 'warning';

const badgeTones: Record<BadgeTone, string> = {
  neural: 'bg-accent-soft text-accent',
  tonal: 'bg-surface-2 text-fg',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
};

export function Badge({
  tone = 'tonal',
  className = '',
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** 实心圆点状态标签 */
export function StatusPill({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <Badge tone={tone}>
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: 'currentColor' }}
      />
      {label}
    </Badge>
  );
}

export function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-sm font-medium text-fg">{label}</span>
      )}
      {children}
      {hint && <span className="mt-2 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/60 focus-ring transition-all border-none outline-none focus:bg-surface-3';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${props.className || ''}`} {...props} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputClass} resize-y leading-relaxed ${props.className || ''}`}
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${inputClass} cursor-pointer appearance-none ${props.className || ''}`}
      {...props}
    />
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`neural-spinner h-4 w-4 ${className}`} />
  );
}

export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon && <div className="text-muted/50 mb-2 scale-125">{icon}</div>}
      <p className="text-base font-medium text-fg">{title}</p>
      {hint && <p className="text-sm text-muted max-w-xs">{hint}</p>}
    </div>
  );
}

/** 主题切换按钮（Aurora / Daylight 互切，更圆润有机）。 */
export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: 'aurora' | 'daylight';
  onToggle: () => void;
}) {
  const isDark = theme === 'aurora';
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle Theme"
      className="relative inline-flex h-8 w-14 items-center rounded-full bg-surface-2 p-1 transition-colors focus-ring hover:bg-surface-3"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1) ${
          isDark ? 'translate-x-0' : 'translate-x-6'
        }`}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
      </span>
    </button>
  );
}
