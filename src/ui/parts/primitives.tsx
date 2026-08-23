/** Мелкие строительные блоки отчёта. Держим отдельно, чтобы экраны читались. */
import { useEffect, type ReactNode } from 'react';

export function Kpi({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'plain' | 'good' | 'warn';
}): JSX.Element {
  const toneClass =
    tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-neutral-900';

  return (
    <div className="rounded border border-neutral-200 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-0.5 text-[18px] font-semibold leading-none ${toneClass}`}>{value}</div>
      {hint !== undefined && <div className="mt-1 text-[10px] text-neutral-500">{hint}</div>}
    </div>
  );
}

export interface Segment {
  readonly label: string;
  readonly value: number;
  readonly className: string;
}

/**
 * Полоса долей. Диаграмма здесь честнее пирога: сравниваются части одного
 * целого, и подписи читаются без легенды-угадайки.
 */
export function StackedBar({ segments }: { segments: readonly Segment[] }): JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="text-[11px] text-neutral-400">Нет данных.</p>;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        {segments.map((segment) =>
          segment.value === 0 ? null : (
            <div
              key={segment.label}
              className={segment.className}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ),
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-baseline gap-2 text-[11px]">
            <span className={`h-2 w-2 shrink-0 rounded-sm ${segment.className}`} />
            <span className="text-neutral-600">{segment.label}</span>
            <span className="min-w-0 flex-1 border-b border-dotted border-neutral-200" />
            <span className="shrink-0 font-medium">{segment.value.toLocaleString('ru')}</span>
            <span className="w-10 shrink-0 text-right text-neutral-400">
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
            {head.map((cell, i) => (
              <th key={cell} className={`pb-1 font-medium ${i === 0 ? '' : 'text-right'}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
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
      className={`border-b border-neutral-100 ${onClick ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
      onClick={onClick}
    >
      {cells.map((cell, i) => (
        <td
          key={i}
          className={`py-1 align-top ${i === 0 ? 'pr-2' : 'pl-2 text-right tabular-nums'}`}
        >
          {cell}
        </td>
      ))}
    </tr>
  );
}

/** Модалка третьего уровня: подробности, которые не должны занимать экран. */
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
      className="absolute inset-0 z-10 flex items-end bg-neutral-900/30 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85%] w-full flex-col rounded-t border border-neutral-200 bg-white shadow-lg sm:max-w-sm sm:rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
          <h3 className="min-w-0 flex-1 truncate font-medium">{title}</h3>
          <button
            className="shrink-0 px-1 text-neutral-400 hover:text-neutral-900"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[12px] leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex gap-2 border-b border-neutral-100 py-1 last:border-0">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

export function pct(part: number, total: number): string {
  if (total === 0) return '—';
  const value = (part / total) * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}
