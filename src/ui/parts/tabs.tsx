/**
 * Экраны отчёта. Три уровня глубины:
 *
 *   1. Сводка   — цифры, ради которых открывают плагин
 *   2. Таблицы  — что именно стоит за каждой цифрой
 *   3. Карточка — детали одной строки, по клику
 */
import { useState } from 'react';
import type { Adoption, MasterUsage, ProbeSummary, RuleOutcome } from '../../shared/probe';
import { Field, Kpi, Modal, pct, Row, StackedBar, Table } from './primitives';

/* ---------- 1. Сводка ---------- */

export function SummaryTab({
  summary,
  adoption,
}: {
  summary: ProbeSummary;
  adoption: Adoption;
}): JSX.Element {
  const instances = adoption.instancesCounted;
  const varNodes =
    adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable + adoption.nodesWithoutVariable;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          label="Компонентов в ходу"
          value={adoption.mastersTotal.toLocaleString('ru')}
          hint={`${instances.toLocaleString('ru')} инстансов`}
        />
        <Kpi
          label="Из дизайн-системы"
          value={pct(adoption.fromLibrary, instances)}
          hint={`${adoption.fromLibrary.toLocaleString('ru')} инстансов`}
          tone={adoption.fromLibrary / Math.max(instances, 1) > 0.8 ? 'good' : 'warn'}
        />
        <Kpi
          label="Покрытие переменными"
          value={pct(adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable, varNodes)}
          hint={`${adoption.nodesWithoutVariable.toLocaleString('ru')} нод без переменной`}
        />
        <Kpi
          label="Оторвано, кандидатов"
          value={adoption.detachedCandidates.toLocaleString('ru')}
          hint="фреймы с именем мастера"
          tone={adoption.detachedCandidates > 0 ? 'warn' : 'plain'}
        />
      </div>

      <section>
        <H>Откуда компоненты</H>
        <StackedBar
          segments={[
            { label: 'Из библиотеки', value: adoption.fromLibrary, className: 'bg-emerald-500' },
            { label: 'Локальные в этом файле', value: adoption.local, className: 'bg-sky-500' },
            { label: 'Мастер недоступен', value: adoption.unknown, className: 'bg-neutral-300' },
          ]}
        />
        {adoption.unknown > 0 && (
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
            «Мастер недоступен» — библиотека отключена от файла либо компонент удалён. Именно эти
            инстансы живут не на подключённой дизайн-системе.
          </p>
        )}
      </section>

      <section>
        <H>Откуда переменные</H>
        <StackedBar
          segments={[
            {
              label: 'Библиотечные',
              value: adoption.nodesOnLibraryVariable,
              className: 'bg-emerald-500',
            },
            { label: 'Локальные', value: adoption.nodesOnLocalVariable, className: 'bg-sky-500' },
            {
              label: 'Без переменной',
              value: adoption.nodesWithoutVariable,
              className: 'bg-neutral-300',
            },
          ]}
        />
      </section>

      {adoption.libraries.length > 0 && (
        <section>
          <H>Библиотеки-источники</H>
          <Table head={['Библиотека', 'Коллекций', 'Переменных']}>
            {adoption.libraries.map((library) => (
              <Row
                key={library.libraryName}
                cells={[library.libraryName, library.collections, library.variables]}
              />
            ))}
          </Table>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
            Библиотеку-источник Figma отдаёт только для переменных. Для компонентов такого API нет —
            видно лишь «из библиотеки» или «локальный».
          </p>
        </section>
      )}

      <section className="border-t border-neutral-200 pt-3">
        <H>Гигиена</H>
        <p className="text-[12px] leading-relaxed">
          {summary.toJudge === 0
            ? 'Применимых срабатываний нет — судить нечего.'
            : `Правила дали ${summary.toJudge} срабатываний в выборке. Подробности — во вкладке «Правила».`}
        </p>
      </section>
    </div>
  );
}

/* ---------- 2. Таблицы ---------- */

export function ComponentsTab({ adoption }: { adoption: Adoption }): JSX.Element {
  const [selected, setSelected] = useState<MasterUsage | null>(null);

  if (adoption.masters.length === 0) {
    return <Empty>Инстансов не найдено — сравнивать нечего.</Empty>;
  }

  return (
    <>
      <p className="mb-2 text-[11px] leading-snug text-neutral-500">
        Считаются инстансы верхнего уровня: вложенные делят мастера с родителем и раздули бы
        картину. Клик по строке — детали.
      </p>
      <Table head={['Мастер', 'Источник', 'Инстансов']}>
        {adoption.masters.map((master) => (
          <Row
            key={master.key}
            onClick={() => setSelected(master)}
            cells={[
              <span className="break-all">{master.name}</span>,
              <OriginBadge origin={master.origin} />,
              master.instances,
            ]}
          />
        ))}
      </Table>

      {selected !== null && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <Field label="Источник" value={<OriginBadge origin={selected.origin} />} />
          <Field label="Инстансов" value={selected.instances.toLocaleString('ru')} />
          <Field
            label="Доля"
            value={`${pct(selected.instances, adoption.instancesCounted)} всех инстансов`}
          />
          <Field
            label="Ключ"
            value={<code className="break-all text-[11px]">{selected.key}</code>}
          />
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            {selected.origin === 'library'
              ? 'Компонент приходит из подключённой библиотеки. Какой именно — Figma через plugin API не сообщает.'
              : 'Компонент определён в этом файле. Для продуктового файла это чаще всего означает локальный форк вместо использования библиотеки.'}
          </p>
        </Modal>
      )}
    </>
  );
}

export function VariablesTab({ adoption }: { adoption: Adoption }): JSX.Element {
  if (adoption.collections.length === 0) {
    return <Empty>Коллекций переменных не найдено.</Empty>;
  }

  return (
    <>
      <Table head={['Коллекция', 'Источник', 'Переменных']}>
        {adoption.collections.map((collection) => (
          <Row
            key={`${collection.name}-${collection.source}`}
            cells={[
              <span className="break-all font-mono text-[11px]">{collection.name}</span>,
              <span className={collection.isLocal ? '' : 'text-neutral-500'}>
                {collection.source}
              </span>,
              collection.variables,
            ]}
          />
        ))}
      </Table>
      <p className="mt-2 text-[11px] leading-snug text-neutral-500">
        «Библиотека не подключена» означает, что переменная используется, но её библиотека к файлу
        не подключена. Это и есть зависимость от чужой системы.
      </p>
    </>
  );
}

export function RulesTab({ summary }: { summary: ProbeSummary }): JSX.Element {
  const [selected, setSelected] = useState<{ rule: string; outcome: RuleOutcome } | null>(null);

  return (
    <>
      <Table head={['Правило', 'Итог', 'Судить']}>
        {summary.rules.map(({ rule, outcome }) => (
          <Row
            key={rule}
            onClick={() => setSelected({ rule, outcome })}
            cells={[
              <span className="font-mono text-[11px]">{rule}</span>,
              <OutcomeCell outcome={outcome} />,
              outcome.status === 'measured' ? outcome.sampled : '—',
            ]}
          />
        ))}
      </Table>

      <section className="mt-3 border-t border-neutral-200 pt-3">
        <H>Слои токенов</H>
        <p
          className={`text-[11px] leading-snug ${summary.layersReadable ? 'text-neutral-500' : 'text-amber-700'}`}
        >
          {summary.layerNote}
        </p>
      </section>

      {selected !== null && (
        <Modal title={selected.rule} onClose={() => setSelected(null)}>
          <Field label="Итог" value={<OutcomeCell outcome={selected.outcome} />} />
          {selected.outcome.status === 'measured' && (
            <>
              <Field label="Срабатываний" value={selected.outcome.hits.toLocaleString('ru')} />
              <Field label="В выборке" value={selected.outcome.sampled} />
            </>
          )}
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            {selected.outcome.status === 'not-applicable'
              ? selected.outcome.reason
              : selected.outcome.status === 'empty'
                ? selected.outcome.note
                : 'Открыть ноды по id из CSV и проставить вердикт: реальная / ложная / намеренная.'}
          </p>
        </Modal>
      )}
    </>
  );
}

/* ---------- мелочи ---------- */

function H({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-[12px] leading-relaxed text-neutral-500">{children}</p>;
}

function OriginBadge({ origin }: { origin: MasterUsage['origin'] }): JSX.Element {
  if (origin === 'library') {
    return <span className="text-emerald-700">библиотека</span>;
  }
  if (origin === 'local') return <span className="text-sky-700">локальный</span>;
  return <span className="text-neutral-400">недоступен</span>;
}

function OutcomeCell({ outcome }: { outcome: RuleOutcome }): JSX.Element {
  if (outcome.status === 'measured') {
    return <strong>{outcome.hits.toLocaleString('ru')}</strong>;
  }
  if (outcome.status === 'empty') return <span className="text-neutral-500">чисто</span>;
  return <span className="text-amber-700">не применимо</span>;
}
