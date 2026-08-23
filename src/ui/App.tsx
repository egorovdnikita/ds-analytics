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
import { Button, Pill } from './parts/primitives';
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

interface Result {
  summary: ProbeSummary;
  adoption: Adoption;
  csv: string;
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
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
          setProgress(`${message.nodesVisited.toLocaleString('ru')} слоёв`);
          return;
        case 'main/scan-finished':
          setRunning(false);
          setProgress('');
          setTab('Сводка');
          setResult({ summary: message.summary, adoption: message.adoption, csv: message.csv });
          return;
        case 'main/error':
          setRunning(false);
          setProgress('');
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

  const start = (): void => {
    setError(null);
    setResult(null);
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
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-medium">{result.summary.fileName}</h1>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              {PROFILE_LABEL[result.summary.profile]} ·{' '}
              {result.summary.nodesVisited.toLocaleString('ru')} слоёв
            </p>
          </div>
          <Button onClick={start}>Ещё раз</Button>
        </div>

        <nav className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-3">
          {TABS.map((name) => (
            <button
              key={name}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${
                tab === name ? 'bg-accent font-medium text-white' : 'bg-white text-ink-soft'
              }`}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Content tab={tab} result={result} onGoTo={setTab} />
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
  progress: string;
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
                scope === item.value ? 'bg-white font-medium shadow-card' : 'text-ink-soft'
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

        <div className="mt-4 h-5">
          {running && progress !== '' && (
            <Pill>
              <span className="tabular-nums">{progress}</span>
            </Pill>
          )}
          {error !== null && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        {fileName !== null && !running && (
          <p className="mt-6 truncate text-[12px] text-ink-faint">{fileName}</p>
        )}
      </div>
    </div>
  );
}

function Content({
  tab,
  result,
  onGoTo,
}: {
  tab: Tab;
  result: Result;
  onGoTo: (tab: Tab) => void;
}): JSX.Element {
  switch (tab) {
    case 'Сводка':
      return <SummaryTab summary={result.summary} adoption={result.adoption} onGoTo={onGoTo} />;
    case 'Компоненты':
      return <ComponentsTab adoption={result.adoption} />;
    case 'Токены':
      return <TokensTab adoption={result.adoption} />;
    case 'Проверки':
      return <ChecksTab summary={result.summary} />;
    case 'CSV':
      return (
        <div className="flex h-full flex-col gap-2">
          <textarea
            className="min-h-0 flex-1 resize-none rounded-card border-0 bg-white p-3 font-mono text-[11px] leading-snug shadow-card"
            readOnly
            value={result.csv}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      );
  }
}
