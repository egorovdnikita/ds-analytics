/**
 * ВЕТКА spike/signal-probe — UI пробника.
 *
 * Отчёт разложен на три уровня, чтобы первый экран отвечал на вопрос
 * «как файл живёт на дизайн-системе» одним взглядом, а подробности
 * доставались по требованию: вкладки — таблицы, клик по строке — карточка.
 */
import { useEffect, useState } from 'react';
import type { MainMessage, UiMessage } from '../shared/messages';
import type { Adoption, ProbeSummary } from '../shared/probe';
import type { ScanScope } from '../shared/types';
import { ComponentsTab, RulesTab, SummaryTab, VariablesTab } from './parts/tabs';

function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

const TABS = ['Сводка', 'Компоненты', 'Переменные', 'Правила', 'CSV'] as const;
type Tab = (typeof TABS)[number];

interface Result {
  summary: ProbeSummary;
  adoption: Adoption;
  csv: string;
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [seed, setSeed] = useState(1);
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
          setProgress(
            `${message.currentPageName} · страница ${message.pagesDone}/${message.pagesTotal} · ${message.nodesVisited.toLocaleString('ru')} нод`,
          );
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
    send({ type: 'ui/scan-requested', scope, seed });
  };

  return (
    <div className="relative flex h-screen flex-col bg-white text-[13px] text-neutral-900">
      <header className="shrink-0 border-b border-neutral-200 px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{fileName ?? 'Подключение…'}</h1>
            <p className="text-[11px] text-neutral-500">
              {result === null
                ? 'измерительный инструмент, не продукт'
                : `${result.summary.scope} · ${result.summary.nodesVisited.toLocaleString('ru')} нод`}
            </p>
          </div>

          <select
            className="shrink-0 rounded border border-neutral-300 bg-white px-2 py-1 text-[12px]"
            value={scope}
            disabled={running}
            onChange={(e) => setScope(e.target.value as ScanScope)}
          >
            <option value="selection">Выделение</option>
            <option value="page">Страница</option>
            <option value="file">Весь файл</option>
          </select>

          {/* seed управляет выборкой: тот же файл и тот же seed дают ту же
              выборку. Экспертный контрол, поэтому узкий и без подписи —
              подпись живёт в title. */}
          <input
            className="w-11 shrink-0 rounded border border-neutral-300 px-1.5 py-1 text-[12px] tabular-nums"
            type="number"
            title="seed выборки — тот же seed даёт ту же выборку"
            value={seed}
            disabled={running}
            onChange={(e) => setSeed(Number(e.target.value))}
          />

          {running ? (
            <button
              className="shrink-0 rounded bg-neutral-200 px-3 py-1 font-medium"
              onClick={() => send({ type: 'ui/scan-cancelled' })}
            >
              Отменить
            </button>
          ) : (
            <button
              className="shrink-0 rounded bg-neutral-900 px-3 py-1 font-medium text-white"
              onClick={start}
            >
              Прогнать
            </button>
          )}
        </div>

        {progress !== '' && <p className="mt-2 text-[11px] text-neutral-500">{progress}</p>}
        {error !== null && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

        {result !== null && (
          <nav className="mt-2 flex gap-3 overflow-x-auto">
            {TABS.map((name) => (
              <button
                key={name}
                className={`whitespace-nowrap border-b-2 pb-1.5 text-[12px] ${
                  tab === name
                    ? 'border-neutral-900 font-medium'
                    : 'border-transparent text-neutral-500'
                }`}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {result === null ? (
          <p className="text-[12px] leading-relaxed text-neutral-500">
            {running
              ? 'Идёт обход. Отмена вернёт частичный результат.'
              : 'Прогон покажет, насколько файл живёт на дизайн-системе: доля компонентов из библиотеки, покрытие переменными и источники токенов.'}
          </p>
        ) : (
          <Content tab={tab} result={result} />
        )}
      </main>
    </div>
  );
}

function Content({ tab, result }: { tab: Tab; result: Result }): JSX.Element {
  switch (tab) {
    case 'Сводка':
      return <SummaryTab summary={result.summary} adoption={result.adoption} />;
    case 'Компоненты':
      return <ComponentsTab adoption={result.adoption} />;
    case 'Переменные':
      return <VariablesTab adoption={result.adoption} />;
    case 'Правила':
      return <RulesTab summary={result.summary} />;
    case 'CSV':
      return (
        <div className="flex h-full flex-col gap-2">
          <p className="text-[11px] text-neutral-500">
            Для судейства по протоколу. Клик в поле — выделится всё.
          </p>
          <textarea
            className="min-h-0 flex-1 resize-none rounded border border-neutral-300 p-2 font-mono text-[10px] leading-snug"
            readOnly
            value={result.csv}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      );
  }
}
