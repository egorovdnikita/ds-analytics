/**
 * Строительные блоки в стиле веба HireHi: серое полотно, белые карточки
 * со скруглениями, зелёный акцент, пилюли вместо рамок.
 */
import { useEffect, type ReactNode } from 'react';

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`rounded-card bg-white p-4 shadow-card ${className}`}>
      {title !== undefined && <h2 className="mb-3 text-[15px] font-medium">{title}</h2>}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-card bg-white p-3 shadow-card">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none">{value}</div>
      {hint !== undefined && <div className="mt-1.5 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}

export interface Segment {
  readonly label: string;
  readonly value: number;
  readonly className: string;
}

/** Полоса долей: части одного целого, подписи читаются без легенды-угадайки. */
export function StackedBar({ segments }: { segments: readonly Segment[] }): JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="text-[12px] text-ink-faint">Нет данных</p>;

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-canvas">
        {segments.map((segment) =>
          segment.value === 0 ? null : (
            <div
              key={segment.label}
              className={segment.className}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ),
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-[13px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.className}`} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{segment.label}</span>
            <span className="shrink-0 font-medium">{segment.value.toLocaleString('ru')}</span>
            <span className="w-9 shrink-0 text-right text-[12px] text-ink-faint">
              {pct(segment.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: readonly string[];
  children: ReactNode;
}): JSX.Element {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="text-left text-[11px] text-ink-faint">
          {head.map((cell, i) => (
            <th key={cell} className={`pb-2 font-normal ${i === 0 ? '' : 'text-right'}`}>
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Row({
  cells,
  onClick,
}: {
  cells: readonly ReactNode[];
  onClick?: () => void;
}): JSX.Element {
  return (
    <tr
      className={`border-t border-canvas ${onClick ? 'cursor-pointer hover:bg-canvas/60' : ''}`}
      onClick={onClick}
    >
      {cells.map((cell, i) => (
        <td key={i} className={`py-2.5 align-middle ${i === 0 ? 'pr-3' : 'pl-3 text-right'}`}>
          {cell}
        </td>
      ))}
    </tr>
  );
}

/** Пилюля-метка: нейтральная, зелёная или предупреждающая. */
export function Pill({
  children,
  tone = 'plain',
}: {
  children: ReactNode;
  tone?: 'plain' | 'accent' | 'warn';
}): JSX.Element {
  const tones = {
    plain: 'bg-canvas text-ink-soft',
    accent: 'bg-accent-soft text-accent-ink',
    warn: 'bg-warn-soft text-warn',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[12px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'accent',
  size = 'md',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'accent' | 'quiet';
  size?: 'md' | 'lg';
}): JSX.Element {
  const look =
    variant === 'accent'
      ? 'bg-accent text-white hover:brightness-95'
      : 'bg-canvas text-ink hover:brightness-95';
  const dims = size === 'lg' ? 'px-6 py-2.5 text-[15px]' : 'px-4 py-2 text-[13px]';
  return (
    <button className={`rounded-full font-medium ${look} ${dims}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink/20 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full flex-col rounded-card bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium">{title}</h3>
          <button className="shrink-0 px-1 text-ink-faint hover:text-ink" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-[13px]">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3 border-t border-canvas py-2 first:border-0">
      <span className="w-24 shrink-0 text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-[12px] leading-relaxed text-ink-faint">{children}</p>;
}

export function pct(part: number, total: number): string {
  if (total === 0) return '—';
  const value = (part / total) * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}
