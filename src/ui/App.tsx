/**
 * ВЕТКА spike/signal-probe — UI пробника, не продукта.
 * Ноль полировки: кнопка, прогресс, CSV для копирования.
 */
import { useEffect, useState } from 'react';
import type { MainMessage, UiMessage } from '../shared/messages';
import type { ScanScope } from '../shared/types';

function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

interface Finished {
  csv: string;
  totals: readonly (readonly [string, number])[];
  nodesVisited: number;
  cancelled: boolean;
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<Finished | null>(null);
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
            `${message.currentPageName} · страница ${message.pagesDone}/${message.pagesTotal} · ${message.nodesVisited} нод`,
          );
          return;
        case 'main/scan-finished':
          setRunning(false);
          setProgress('');
          setResult(message);
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
    <main className="flex h-screen flex-col gap-3 p-4 text-sm">
      <header>
        <h1 className="font-medium">Пробник сигнала</h1>
        <p className="text-xs text-neutral-500">
          {fileName ?? 'Подключение…'} · измерительный инструмент, не продукт
        </p>
      </header>

      <div className="flex items-center gap-2">
        <select
          className="rounded border border-neutral-300 px-2 py-1"
          value={scope}
          disabled={running}
          onChange={(e) => setScope(e.target.value as ScanScope)}
        >
          <option value="selection">Выделение</option>
          <option value="page">Страница</option>
          <option value="file">Весь файл</option>
        </select>

        <label className="flex items-center gap-1 text-xs text-neutral-500">
          seed
          <input
            className="w-16 rounded border border-neutral-300 px-2 py-1"
            type="number"
            value={seed}
            disabled={running}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>

        {running ? (
          <button
            className="rounded bg-neutral-200 px-3 py-1"
            onClick={() => send({ type: 'ui/scan-cancelled' })}
          >
            Отменить
          </button>
        ) : (
          <button className="rounded bg-neutral-900 px-3 py-1 text-white" onClick={start}>
            Прогнать
          </button>
        )}
      </div>

      {progress !== '' && <p className="text-xs text-neutral-500">{progress}</p>}
      {error !== null && <p className="text-xs text-red-600">{error}</p>}

      {result !== null && (
        <>
          <div className="text-xs">
            {result.cancelled && <p className="text-amber-600">Обход отменён — данные неполные.</p>}
            <p className="text-neutral-500">Пройдено нод: {result.nodesVisited}</p>
            <ul className="mt-1">
              {result.totals.map(([rule, count]) => (
                <li key={rule} className="flex justify-between">
                  <span className="font-mono">{rule}</span>
                  <span className={count === 0 ? 'text-neutral-400' : ''}>{count}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-neutral-500">
            Скопировать в таблицу. Колонка «вердикт» — для судейства по протоколу.
          </p>
          <textarea
            className="flex-1 resize-none rounded border border-neutral-300 p-2 font-mono text-[11px]"
            readOnly
            value={result.csv}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
    </main>
  );
}
