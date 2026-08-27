/**
 * UI плагина. Здесь нет `figma.*` — только сообщения через shared/messages.
 *
 * Стартовый экран центрирован вокруг одного действия. Дальше — сводка,
 * из неё переходы в таблицы, из таблиц — карточки с переходом к слою.
 */
import { useEffect, useState } from 'react';
import type { ScanReport } from '../shared/adoption';
import type { MainMessage, UiMessage } from '../shared/messages';
import type { ScanScope } from '../shared/types';
import { Button, Pill, Progress, Segmented } from './parts/primitives';
import { ComponentsScreen, SummaryScreen, TokensScreen, type MasterFilter } from './parts/report';

function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

const TABS = ['Сводка', 'Компоненты', 'Токены'] as const;
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

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progressing | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [tab, setTab] = useState<Tab>('Сводка');
  const [componentFilter, setComponentFilter] = useState<MasterFilter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<{ pluginMessage?: MainMessage }>): void {
      const message = event.data.pluginMessage;
      if (message === undefined) return;

      switch (message.type) {
        case 'main/booted':
          setFileName(message.fileName);
          if (message.lastScope !== null) setScope(message.lastScope);
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
          setReport(message.report);
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
    setReport(null);
    setProgress(null);
    setRunning(true);
    send({ type: 'ui/scan-requested', scope });
  };

  if (report === null) {
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
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium">{report.fileName}</h1>
          <Button onClick={start}>Ещё раз</Button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Pill>{report.scope}</Pill>
          <span className="text-[12px] tabular-nums text-ink-faint">
            {report.nodesVisited.toLocaleString('ru')} слоёв
          </span>
          {report.cancelled && <Pill tone="warn">остановлено</Pill>}
        </div>

        <div className="mt-2.5">
          <Segmented options={SCOPES} value={scope} onChange={setScope} />
        </div>

        <nav className="-mx-1 mt-2.5 flex gap-1 overflow-x-auto px-1 pb-3">
          {TABS.map((name) => {
            const count = countFor(name, report);
            const active = tab === name;
            return (
              <button
                key={name}
                className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] ${
                  active ? 'bg-accent font-medium text-white' : 'bg-white text-ink-soft'
                }`}
                onClick={() => {
                  if (name === 'Компоненты') setComponentFilter('all');
                  setTab(name);
                }}
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
        <Content
          tab={tab}
          report={report}
          componentFilter={componentFilter}
          onGoTo={(next, filter) => {
            if (filter !== undefined) setComponentFilter(filter);
            setTab(next);
          }}
          onReveal={reveal}
        />
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
              className={`rounded-pill px-3 py-1.5 text-[13px] ${
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

/** Счётчик на вкладке: сразу видно, где есть что смотреть, до перехода. */
function countFor(tab: Tab, report: ScanReport): number | null {
  switch (tab) {
    case 'Компоненты':
      return report.adoption.masters.length;
    case 'Токены':
      return report.adoption.collections.length;
    case 'Сводка':
      return null;
  }
}

function Content({
  tab,
  report,
  componentFilter,
  onGoTo,
  onReveal,
}: {
  tab: Tab;
  report: ScanReport;
  componentFilter: MasterFilter;
  onGoTo: (tab: Tab, filter?: MasterFilter) => void;
  onReveal: (nodeId: string, pageId: string) => void;
}): JSX.Element {
  switch (tab) {
    case 'Сводка':
      return <SummaryScreen adoption={report.adoption} trend={report.trend} onGoTo={onGoTo} />;
    case 'Компоненты':
      return (
        // key сбрасывает состояние экрана при смене фильтра снаружи —
        // иначе переход «из сводки в отфильтрованный список» ничего не менял.
        <ComponentsScreen
          key={componentFilter}
          adoption={report.adoption}
          initialFilter={componentFilter}
          onReveal={onReveal}
        />
      );
    case 'Токены':
      return <TokensScreen adoption={report.adoption} />;
  }
}
