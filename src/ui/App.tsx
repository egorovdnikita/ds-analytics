/**
 * ВЕТКА spike/signal-probe — UI пробника.
 *
 * Экран результата отвечает на один вопрос: что означает каждое число.
 * Голый список счётчиков этого не делает — в нём ноль «ничего не нашли»
 * и ноль «правило не могло отработать» выглядят одинаково.
 */
import { useEffect, useState } from 'react';
import type { MainMessage, UiMessage } from '../shared/messages';
import { PROFILE_LABEL, type ProbeSummary, type RuleOutcome } from '../shared/probe';
import type { ScanScope } from '../shared/types';

function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<ScanScope>('page');
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<ProbeSummary | null>(null);
  const [csv, setCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);
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
          setSummary(message.summary);
          setCsv(message.csv);
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
    setSummary(null);
    setShowCsv(false);
    setRunning(true);
    send({ type: 'ui/scan-requested', scope, seed });
  };

  return (
    <div className="flex h-screen flex-col bg-white text-[13px] text-neutral-900">
      <header className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <h1 className="font-semibold">Пробник сигнала</h1>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {fileName ?? 'Подключение…'} · измерительный инструмент, не продукт
        </p>

        <div className="mt-3 flex items-center gap-2">
          <select
            className="rounded border border-neutral-300 bg-white px-2 py-1"
            value={scope}
            disabled={running}
            onChange={(e) => setScope(e.target.value as ScanScope)}
          >
            <option value="selection">Выделение</option>
            <option value="page">Страница</option>
            <option value="file">Весь файл</option>
          </select>

          <label className="flex items-center gap-1 text-[11px] text-neutral-500">
            seed
            <input
              className="w-14 rounded border border-neutral-300 px-2 py-1 text-neutral-900"
              type="number"
              value={seed}
              disabled={running}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>

          <div className="ml-auto">
            {running ? (
              <button
                className="rounded bg-neutral-200 px-3 py-1 font-medium"
                onClick={() => send({ type: 'ui/scan-cancelled' })}
              >
                Отменить
              </button>
            ) : (
              <button
                className="rounded bg-neutral-900 px-3 py-1 font-medium text-white"
                onClick={start}
              >
                Прогнать
              </button>
            )}
          </div>
        </div>

        {progress !== '' && <p className="mt-2 text-[11px] text-neutral-500">{progress}</p>}
        {error !== null && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {summary === null ? (
          <Placeholder running={running} />
        ) : showCsv ? (
          <CsvView csv={csv} onBack={() => setShowCsv(false)} />
        ) : (
          <Report summary={summary} onShowCsv={() => setShowCsv(true)} />
        )}
      </div>
    </div>
  );
}

function Placeholder({ running }: { running: boolean }): JSX.Element {
  return (
    <p className="text-[12px] leading-relaxed text-neutral-500">
      {running
        ? 'Идёт обход. Отмена вернёт частичный результат.'
        : 'Прогон покажет, какие правила на этом файле вообще применимы и сколько срабатываний предстоит отсудить.'}
    </p>
  );
}

/* ---------- отчёт ---------- */

function Report({
  summary,
  onShowCsv,
}: {
  summary: ProbeSummary;
  onShowCsv: () => void;
}): JSX.Element {
  const d = summary.diagnostics;

  return (
    <div className="flex flex-col gap-4">
      {summary.cancelled && (
        <Banner tone="warn">Обход отменён — цифры неполные, судить по ним нельзя.</Banner>
      )}

      <section>
        <SectionTitle>Профиль файла</SectionTitle>
        <p className="font-medium">{PROFILE_LABEL[summary.profile]}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{summary.profileNote}</p>

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <Stat label="Нод пройдено" value={summary.nodesVisited.toLocaleString('ru')} />
          <Stat
            label="Внутри инстансов"
            value={`${d.nodesInsideInstance.toLocaleString('ru')} · ${share(d.nodesInsideInstance, d.nodesTotal)}`}
          />
          <Stat label="Локальных компонентов" value={d.localComponents.toLocaleString('ru')} />
          <Stat label="Инстансов" value={d.instancesTotal.toLocaleString('ru')} />
          <Stat label="Нод с переменной" value={d.nodesWithAlias.toLocaleString('ru')} />
          <Stat label="Нод со стилем заливки" value={d.nodesWithFillStyle.toLocaleString('ru')} />
        </dl>
      </section>

      <section>
        <SectionTitle>Правила</SectionTitle>
        <ul className="flex flex-col gap-2">
          {summary.rules.map(({ rule, outcome }) => (
            <RuleRow key={rule} rule={rule} outcome={outcome} />
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Коллекции переменных</SectionTitle>
        {d.collectionNames.length === 0 ? (
          <p className="text-[11px] text-neutral-500">Не найдено.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {unique(d.collectionNames).map(({ name, count }) => (
                <span
                  key={name}
                  className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {name}
                  {count > 1 && <span className="text-neutral-400"> ×{count}</span>}
                </span>
              ))}
            </div>
            <p
              className={`mt-2 text-[11px] leading-relaxed ${summary.layersReadable ? 'text-neutral-500' : 'text-amber-700'}`}
            >
              {summary.layerNote}
            </p>
          </>
        )}
      </section>

      <section className="border-t border-neutral-200 pt-3">
        <SectionTitle>Дальше</SectionTitle>
        {summary.toJudge === 0 ? (
          <p className="text-[12px] leading-relaxed text-neutral-500">
            Судить нечего: ни одно правило не дало срабатываний, применимых на этом файле. Нужен
            файл другого профиля.
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed">
            Отсудить <strong>{summary.toJudge}</strong>{' '}
            {plural(summary.toJudge, 'срабатывание', 'срабатывания', 'срабатываний')} по протоколу:
            открыть по id ноды и проставить вердикт{' '}
            <span className="text-neutral-500">реальная / ложная / намеренная</span>.
          </p>
        )}
        <button
          className="mt-2 rounded border border-neutral-300 px-3 py-1 font-medium"
          onClick={onShowCsv}
        >
          Показать CSV для судейства
        </button>
      </section>
    </div>
  );
}

/**
 * Строка правила — две строки, а не одна.
 *
 * Причина найдена на 480px: объяснение «не применимо» длиннее любой
 * разумной колонки и уезжает за край панели. Статус короткий и стоит
 * справа, объяснение — отдельной строкой во всю ширину.
 */
function RuleRow({ rule, outcome }: { rule: string; outcome: RuleOutcome }): JSX.Element {
  const dim = outcome.status !== 'measured';

  return (
    <li>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-[11px] ${dim ? 'text-neutral-400' : ''}`}>{rule}</span>
        <span className="min-w-0 flex-1 border-b border-dotted border-neutral-200" />
        <Status outcome={outcome} />
      </div>
      <Explanation outcome={outcome} />
    </li>
  );
}

function Status({ outcome }: { outcome: RuleOutcome }): JSX.Element {
  if (outcome.status === 'measured') {
    return (
      <span className="shrink-0 whitespace-nowrap">
        <strong>{outcome.hits.toLocaleString('ru')}</strong>
        <span className="ml-1 text-[11px] text-neutral-500">судить {outcome.sampled}</span>
      </span>
    );
  }
  if (outcome.status === 'empty') {
    return <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">чисто</span>;
  }
  return (
    <span className="shrink-0 whitespace-nowrap text-[11px] text-amber-700">не применимо</span>
  );
}

function Explanation({ outcome }: { outcome: RuleOutcome }): JSX.Element | null {
  if (outcome.status === 'measured') return null;

  const text = outcome.status === 'empty' ? outcome.note : outcome.reason;
  const tone = outcome.status === 'empty' ? 'text-neutral-400' : 'text-amber-700';

  return <p className={`mt-0.5 pl-2 text-[11px] leading-snug ${tone}`}>{text}</p>;
}

/* ---------- CSV ---------- */

function CsvView({ csv, onBack }: { csv: string; onBack: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          className="rounded border border-neutral-300 px-3 py-1 font-medium"
          onClick={onBack}
        >
          ← К отчёту
        </button>
        <p className="text-[11px] text-neutral-500">Кликните в поле — выделится всё.</p>
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none rounded border border-neutral-300 p-2 font-mono text-[10px] leading-snug"
        readOnly
        value={csv}
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

/* ---------- мелочи ---------- */

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <dt className="truncate text-neutral-500">{label}</dt>
      <dd className="shrink-0 font-medium">{value}</dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn'; children: React.ReactNode }): JSX.Element {
  return (
    <p
      className={`rounded px-2 py-1.5 text-[11px] ${tone === 'warn' ? 'bg-amber-50 text-amber-800' : ''}`}
    >
      {children}
    </p>
  );
}

function share(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function unique(names: readonly string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

/** Русская плюрализация: 1 срабатывание, 2 срабатывания, 5 срабатываний. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
