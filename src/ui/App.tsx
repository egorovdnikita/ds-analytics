/**
 * ВЕТКА spike/signal-probe — UI пробника.
 *
 * Стартовый экран центрирован вокруг одного действия. Дальше — сводка,
 * из неё переходы в таблицы, из таблиц — карточки. Полотно серое,
 * содержимое живёт в белых карточках.
 */
import { useEffect, useState } from 'react';
import type { MainMessage, UiMessage } from '../shared/messages';
import { PROFILE_LABEL, type Adoption, type ProbeSummary } from '../shared/probe';
import type { ScanScope } from '../shared/types';
import { Button, Pill, Progress, Segmented } from './parts/primitives';
import { ChecksTab, ComponentsTab, SummaryTab, TokensTab } from './parts/tabs';

function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

const TABS = ['Сводка', 'Компоненты', 'Токены', 'Проверки', 'CSV'] as const;
type Tab = (typeof TABS)[number];

const SCOPES: readonly { value: ScanScope; label: string }[] = [
  { value: 'selection', label: 'выделение' },
  { value: 'page', label: 'страница' },
  { value: 'file', label: 'весь файл' },
];

interface Progressing {
  nodes: number;
  pagesDone: number;
  pagesTotal: number;
  page: string;
}

interface Result {
  summary: ProbeSummary;
  adoption: Adoption;
  csv: string;
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    nodes: number;
    pagesDone: number;
    pagesTotal: number;
    page: string;
  } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<Tab>('Сводка');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<{ pluginMessage?: MainMessage }>): void {
      const message = event.data.pluginMessage;
      if (message === undefined) return;

      switch (message.type) {
        case 'main/booted':
          setFileName(message.fileName);
          return;
        case 'main/scan-progress':
          setProgress({
            nodes: message.nodesVisited,
            pagesDone: message.pagesDone,
            pagesTotal: message.pagesTotal,
            page: message.currentPageName,
          });
          return;
        case 'main/scan-finished':
          setRunning(false);
          setProgress(null);
          setTab('Сводка');
          setResult({ summary: message.summary, adoption: message.adoption, csv: message.csv });
          return;
        case 'main/error':
          setRunning(false);
          setProgress(null);
          setError(message.message);
          return;
      }
    }
    window.addEventListener('message', onMessage);
    send({ type: 'ui/ready' });
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const reveal = (nodeId: string, pageId: string): void => {
    send({ type: 'ui/reveal', nodeId, pageId });
  };

  const start = (): void => {
    setError(null);
    setResult(null);
    setProgress(null);
    setRunning(true);
    send({ type: 'ui/scan-requested', scope, seed: 1 });
  };

  if (result === null) {
    return (
      <Start
        fileName={fileName}
        scope={scope}
        setScope={setScope}
        running={running}
        progress={progress}
        error={error}
        onStart={start}
        onCancel={() => send({ type: 'ui/scan-cancelled' })}
      />
    );
  }

  return (
    <div className="relative flex h-screen flex-col bg-canvas">
      <header className="shrink-0 px-4 pt-4">
        {/* Три строки, а не одна: на 480px имя файла, переключатель охвата и
            кнопка в один ряд не помещаются — имя схлопывалось в «Дизайн…». */}
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium">
            {result.summary.fileName}
          </h1>
          <Button onClick={start}>Ещё раз</Button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Pill>{PROFILE_LABEL[result.summary.profile]}</Pill>
          <span className="text-[12px] tabular-nums text-ink-faint">
            {result.summary.nodesVisited.toLocaleString('ru')} слоёв
          </span>
        </div>

        <div className="mt-2.5">
          <Segmented options={SCOPES} value={scope} onChange={setScope} />
        </div>

        <nav className="-mx-1 mt-2.5 flex gap-1 overflow-x-auto px-1 pb-3">
          {TABS.map((name) => {
            const count = countFor(name, result);
            const active = tab === name;
            return (
              <button
                key={name}
                className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] ${
                  active ? 'bg-accent font-medium text-white' : 'bg-white text-ink-soft'
                }`}
                onClick={() => setTab(name)}
              >
                {name}
                {count !== null && (
                  <span
                    className={`tabular-nums text-[11px] ${active ? 'text-white/70' : 'text-ink-faint'}`}
                  >
                    {count.toLocaleString('ru')}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Content tab={tab} result={result} onGoTo={setTab} onReveal={reveal} />
      </main>
    </div>
  );
}

/** Стартовый экран: одно действие по центру, всё остальное — второстепенно. */
function Start({
  fileName,
  scope,
  setScope,
  running,
  progress,
  error,
  onStart,
  onCancel,
}: {
  fileName: string | null;
  scope: ScanScope;
  setScope: (scope: ScanScope) => void;
  running: boolean;
  progress: Progressing | null;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="w-full max-w-xs">
        <h1 className="text-[22px] font-semibold leading-tight">
          проверим, как файл живёт
          <br />
          на дизайн-системе
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Сколько компонентов берётся из библиотеки, сколько сделано мимо неё и на чём держатся
          цвета.
        </p>

        <div className="mt-6 flex justify-center gap-1">
          {SCOPES.map((item) => (
            <button
              key={item.value}
              disabled={running}
              className={`rounded-full px-3 py-1.5 text-[13px] ${
                scope === item.value ? 'bg-white font-medium' : 'text-ink-soft'
              }`}
              onClick={() => setScope(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          {running ? (
            <Button variant="quiet" size="lg" onClick={onCancel}>
              Остановить
            </Button>
          ) : (
            <Button size="lg" onClick={onStart}>
              Проверить
            </Button>
          )}
        </div>

        <div className="mt-5 min-h-[46px]">
          {running && progress !== null && (
            <Progress
              done={progress.pagesTotal > 1 ? progress.pagesDone : progress.nodes}
              total={progress.pagesTotal > 1 ? progress.pagesTotal : Math.max(progress.nodes, 1)}
              caption={
                progress.pagesTotal > 1
                  ? `${progress.page} · страница ${progress.pagesDone + 1} из ${progress.pagesTotal} · ${progress.nodes.toLocaleString('ru')} слоёв`
                  : `${progress.nodes.toLocaleString('ru')} слоёв`
              }
            />
          )}
          {error !== null && <p className="text-[12px] leading-snug text-danger">{error}</p>}
        </div>

        {fileName !== null && !running && (
          <p className="mt-6 truncate text-[12px] text-ink-faint">{fileName}</p>
        )}
      </div>
    </div>
  );
}

/** Счётчик на вкладке: сразу видно, где есть что смотреть. */
function countFor(tab: Tab, result: Result): number | null {
  switch (tab) {
    case 'Компоненты':
      return result.adoption.masters.length;
    case 'Токены':
      return result.adoption.collections.length;
    case 'Проверки':
      return result.summary.rules.filter((rule) => rule.outcome.status === 'measured').length;
    case 'Сводка':
    case 'CSV':
      return null;
  }
}

function Content({
  tab,
  result,
  onGoTo,
  onReveal,
}: {
  tab: Tab;
  result: Result;
  onGoTo: (tab: Tab) => void;
  onReveal: (nodeId: string, pageId: string) => void;
}): JSX.Element {
  switch (tab) {
    case 'Сводка':
      return <SummaryTab summary={result.summary} adoption={result.adoption} onGoTo={onGoTo} />;
    case 'Компоненты':
      return <ComponentsTab adoption={result.adoption} onReveal={onReveal} />;
    case 'Токены':
      return <TokensTab adoption={result.adoption} />;
    case 'Проверки':
      return <ChecksTab summary={result.summary} onReveal={onReveal} />;
    case 'CSV':
      return <CsvView csv={result.csv} />;
  }
}

/**
 * Выгрузка. Кнопка копирования вместо «выделите всё сами».
 *
 * Через скрытое поле и execCommand: в iframe плагина navigator.clipboard
 * доступен не всегда, и молча ничего не скопировать — худший исход.
 */
function CsvView({ csv }: { csv: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    const field = document.createElement('textarea');
    field.value = csv;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } finally {
      document.body.removeChild(field);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</Button>
        <span className="text-[12px] text-ink-faint">
          {csv.split('\n').length.toLocaleString('ru')} строк
        </span>
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none rounded-card border-0 bg-white p-3 font-mono text-[11px] leading-snug outline-none"
        readOnly
        value={csv}
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}
