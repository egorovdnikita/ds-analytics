/**
 * Строительные блоки в стиле веба HireHi: серое полотно, белые карточки
 * со скруглениями, зелёный акцент, пилюли вместо рамок.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { IconName } from '../icons';
import { Icon } from './icon';

/**
 * Статусная тональность Box UI.
 *
 * Статусные токены разрешаются там, где объявлены, поэтому одного
 * `data-status` на элементе мало: тема на корне уже разрешила их под свою
 * тональность. Box UI решает это атрибутом `data-box-control` — controls.css
 * переобъявляет статусные переменные прямо на таком элементе. Здесь ровно
 * этот штатный механизм, без своих обходов.
 */
export type StatusKind = 'positive' | 'warning' | 'negative' | 'information';

export function statusAttrs(kind: StatusKind): {
  'data-box-control': string;
  'data-status': StatusKind;
} {
  return { 'data-box-control': '', 'data-status': kind };
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`rounded-card bg-surface p-4 ${className}`}>
      {title !== undefined && (
        <header className="mb-3 flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 text-body-l font-medium">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Кольцо с числом в центре.
 *
 * Для одной доли кольцо читается быстрее полосы: глаз хватает заполнение
 * целиком, а не сравнивает длину с невидимым эталоном.
 */
export function Ring({
  value,
  total,
  caption,
  tone = 'accent',
}: {
  value: number;
  total: number;
  caption: string;
  tone?: 'accent' | 'warn';
}): JSX.Element {
  const share = total === 0 ? 0 : value / total;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const stroke = tone === 'accent' ? 'var(--accent-fill-solid)' : 'var(--status-fill-solid)';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 80 80"
        className="h-[84px] w-[84px] -rotate-90"
        {...(tone === 'warn' ? statusAttrs('warning') : {})}
      >
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--surface-base-fill-page)"
          strokeWidth="9"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference}`}
        />
      </svg>
      <div className="-mt-[54px] text-h5 font-semibold tabular-nums">{pct(value, total)}</div>
      <div className="mt-[26px] text-center text-caption-l leading-tight text-ink-soft">
        {caption}
      </div>
    </div>
  );
}

/**
 * Столбец внутри ячейки таблицы.
 *
 * Даёт сравнение строк между собой без отдельной диаграммы: длина
 * подложки — это и есть график, а число остаётся точным.
 */
export function BarCell({
  value,
  max,
  tone = 'accent',
}: {
  value: number;
  max: number;
  tone?: 'accent' | 'warn' | 'faint';
}): JSX.Element {
  const width = max === 0 ? 0 : Math.max((value / max) * 100, 2);
  const fills = { accent: 'bg-accent-soft', warn: 'bg-status-soft', faint: 'bg-line-strong' };

  return (
    <div className="relative h-6 min-w-[64px] overflow-hidden rounded-xs">
      <div
        className={`absolute inset-y-0 left-0 ${fills[tone]}`}
        style={{ width: `${width}%` }}
        {...(tone === 'warn' ? statusAttrs('warning') : {})}
      />
      <span className="relative flex h-full items-center justify-end px-1.5 text-body-m font-medium tabular-nums">
        {value.toLocaleString('ru')}
      </span>
    </div>
  );
}

/** Сегментированный переключатель — компактнее набора кнопок. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className="inline-flex rounded-pill bg-canvas p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-pill px-2.5 py-1 text-caption-l ${
            value === option.value ? 'bg-surface font-medium' : 'text-ink-soft'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Пустое состояние: что случилось и что с этим делать. */
export function Empty({ title, hint }: { title: string; hint?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-4 py-10 text-center">
      <span className="mb-2 text-ink-faint">
        <Icon name="info-circle" size="xs" />
      </span>
      <p className="text-body-m font-medium">{title}</p>
      {hint !== undefined && (
        <p className="mx-auto mt-1.5 max-w-[240px] text-caption-l leading-relaxed text-ink-faint">
          {hint}
        </p>
      )}
    </div>
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
    <div className="rounded-card bg-surface p-3">
      <div className="text-caption-l text-ink-soft">{label}</div>
      <div className="mt-1 text-h4 font-semibold leading-none">{value}</div>
      {hint !== undefined && <div className="mt-1.5 text-caption-l text-ink-faint">{hint}</div>}
    </div>
  );
}

export interface Segment {
  readonly label: string;
  readonly value: number;
  readonly className: string;
  /** Клик по сегменту ведёт в отфильтрованный список. */
  readonly onClick?: () => void;
  /** Статусный сегмент красится токенами статуса, а не акцента. */
  readonly status?: StatusKind;
}

/** Полоса долей: части одного целого, подписи читаются без легенды-угадайки. */
export function StackedBar({ segments }: { segments: readonly Segment[] }): JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="text-caption-l text-ink-faint">Нет данных</p>;

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-pill bg-canvas">
        {segments.map((segment) =>
          segment.value === 0 ? null : (
            <div
              key={segment.label}
              className={segment.className}
              {...(segment.status === undefined ? {} : statusAttrs(segment.status))}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ),
        )}
      </div>
      <ul className="mt-3 flex flex-col">
        {segments.map((segment) => {
          const body = (
            <>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-pill ${segment.className}`}
                {...(segment.status === undefined ? {} : statusAttrs(segment.status))}
              />
              <span className="min-w-0 flex-1 truncate text-left text-ink-soft">
                {segment.label}
              </span>
              <span className="shrink-0 font-medium">{segment.value.toLocaleString('ru')}</span>
              <span className="w-9 shrink-0 text-right text-caption-l text-ink-faint">
                {pct(segment.value, total)}
              </span>
            </>
          );

          return (
            <li key={segment.label}>
              {segment.onClick === undefined || segment.value === 0 ? (
                <div className="flex items-center gap-2 py-1 text-body-m">{body}</div>
              ) : (
                <button
                  className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-xs px-1.5 py-1 text-body-m hover:bg-hover"
                  onClick={segment.onClick}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
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
    <table className="w-full border-collapse text-body-m">
      <thead>
        <tr className="text-left text-caption-l text-ink-faint">
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
      className={`border-t border-line-subtle ${onClick ? 'cursor-pointer hover:bg-hover' : ''}`}
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
    warn: 'bg-status-soft text-status-ink',
  };
  return (
    <span
      className={`inline-block rounded-pill px-2 py-0.5 text-caption-l ${tones[tone]}`}
      {...(tone === 'warn' ? statusAttrs('warning') : {})}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'accent',
  size = 'md',
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'accent' | 'quiet';
  size?: 'md' | 'lg';
  icon?: IconName;
}): JSX.Element {
  // Наведение — токены interaction Box UI, а не фильтр яркости: так кнопка
  // ведёт себя одинаково в светлой и тёмной теме.
  const look =
    variant === 'accent'
      ? 'bg-accent text-accent-on hover:bg-accent-hover'
      : 'bg-canvas text-ink hover:bg-hover';
  const dims = size === 'lg' ? 'gap-2 px-6 py-2.5 text-body-l' : 'gap-1.5 px-4 py-2 text-body-m';
  return (
    <button
      className={`inline-flex items-center rounded-pill font-medium ${look} ${dims}`}
      onClick={onClick}
    >
      {icon !== undefined && <Icon name={icon} size={size === 'lg' ? '2xs' : 'min'} />}
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
      className="absolute inset-0 z-10 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full flex-col rounded-card bg-surface ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h3 className="min-w-0 flex-1 truncate text-body-l font-medium">{title}</h3>
          <button className="shrink-0 px-1 text-ink-faint hover:text-ink" onClick={onClose}>
            <Icon name="close-circle" size="2xs" title="Закрыть" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-body-m">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3 border-t border-line-subtle py-2 first:border-0">
      <span className="w-24 shrink-0 text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-caption-l leading-relaxed text-ink-faint">{children}</p>;
}

export function pct(part: number, total: number): string {
  if (total === 0) return '—';
  const value = (part / total) * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

/** Полоса выполнения. Два уровня: страницы и слои. */
export function Progress({
  done,
  total,
  caption,
}: {
  done: number;
  total: number;
  caption: string;
}): JSX.Element {
  const share = total === 0 ? 0 : Math.min(done / total, 1);
  return (
    <div className="w-full">
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-canvas">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-300"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p className="mt-2 text-center text-caption-l tabular-nums text-ink-soft">{caption}</p>
    </div>
  );
}

/**
 * Список мест с переходом к слою.
 *
 * Ради этого экрана всё и затевалось: увидеть проблему мало, надо до неё
 * дойти. Клик выделяет слой в Figma и подводит к нему вьюпорт.
 */
export function Places({
  places,
  onReveal,
}: {
  places: readonly { nodeId: string; pageId: string; name: string; detail?: string }[];
  onReveal: (nodeId: string, pageId: string) => void;
}): JSX.Element {
  if (places.length === 0) {
    return <Note>Мест для перехода нет.</Note>;
  }

  return (
    <ul className="flex flex-col">
      {places.map((place) => (
        <li key={place.nodeId}>
          <button
            className="flex w-full items-center gap-2 border-t border-line-subtle py-2 text-left first:border-0 hover:bg-hover"
            onClick={() => onReveal(place.nodeId, place.pageId)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-m">{place.name}</span>
              {place.detail !== undefined && place.detail !== '' && (
                <span className="mt-0.5 block truncate text-caption-l text-ink-faint">
                  {place.detail}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-caption-l text-accent-ink">
              <Icon name="map-point" />
              перейти
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Пункт «с чего начать»: что не так, сколько и куда идти.
 *
 * Дашборд без такого блока перекладывает интерпретацию на читателя:
 * «75%» само по себе не говорит, хорошо это или плохо.
 */
export function AdviceRow({
  title,
  value,
  hint,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      <span className="mt-px shrink-0 text-status-ink" {...statusAttrs('warning')}>
        <Icon name="danger-triangle" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-body-m font-medium">{title}</span>
          <span
            className="shrink-0 text-caption-l tabular-nums text-status-ink"
            {...statusAttrs('warning')}
          >
            {value}
          </span>
        </span>
        <span className="mt-0.5 block text-caption-l leading-snug text-ink-faint">{hint}</span>
      </span>
      {onClick !== undefined && (
        <span className="shrink-0 self-center text-accent-ink">
          <Icon name="alt-arrow-right" />
        </span>
      )}
    </>
  );

  const className = 'flex w-full gap-2 border-t border-line-subtle py-2.5 text-left first:border-0';
  return onClick === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <button className={`${className} hover:bg-hover`} onClick={onClick}>
      {body}
    </button>
  );
}

/**
 * Спарклайн: форма тренда, а не точные значения.
 *
 * Числа даёт дельта рядом; линия отвечает на другой вопрос — растёт ли
 * покрытие вообще или дёргается туда-сюда.
 */
export function Sparkline({
  values,
  className = 'stroke-accent',
}: {
  values: readonly number[];
  className?: string;
}): JSX.Element | null {
  if (values.length < 2) return null;

  const width = 120;
  const height = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = values[values.length - 1] ?? 0;
  const lastY = height - ((last - min) / span) * height;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-[120px] overflow-visible">
      <polyline
        points={points}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      />
      <circle cx={width} cy={lastY} r="2.5" className="fill-accent" />
    </svg>
  );
}

/** Изменение в процентных пунктах со знаком. */
export function Delta({ points, since }: { points: number; since: string }): JSX.Element {
  const rising = points > 0;
  const flat = points === 0;
  const tone = flat ? 'text-ink-faint' : rising ? 'text-accent-ink' : 'text-status-ink';
  const sign = flat ? '' : rising ? '+' : '−';

  return (
    <span
      className={`text-caption-l tabular-nums ${tone}`}
      {...(!flat && !rising ? statusAttrs('warning') : {})}
    >
      {flat ? 'без изменений' : `${sign}${Math.abs(points)} п.п.`}
      <span className="ml-1 text-ink-faint">с {since}</span>
    </span>
  );
}

/**
 * Кнопка «скопировать» с подтверждением.
 *
 * Через скрытое поле и execCommand: в iframe плагина navigator.clipboard
 * доступен не всегда, а молча ничего не скопировать — худший исход.
 */
export function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } finally {
      document.body.removeChild(field);
    }
  };

  return (
    <Button onClick={copy} icon={copied ? 'check-circle' : 'copy'}>
      {copied ? 'Скопировано' : label}
    </Button>
  );
}

/** Поле поиска с иконкой Box UI. Очистка — кнопкой, а не только Backspace. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 rounded-pill bg-canvas px-3.5 py-2 text-ink-faint">
      <Icon name="magnifer" />
      <input
        className="min-w-0 flex-1 bg-transparent text-body-m text-ink outline-none placeholder:text-ink-faint"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== '' && (
        <button className="shrink-0 hover:text-ink" onClick={() => onChange('')}>
          <Icon name="close-circle" title="Очистить" />
        </button>
      )}
    </label>
  );
}
