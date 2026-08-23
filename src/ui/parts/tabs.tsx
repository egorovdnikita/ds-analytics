/**
 * Экраны отчёта. Три уровня глубины: сводка → таблицы → карточка по клику.
 * Тексты бытовые: «токен», «копия», «библиотека», без терминов из кода.
 */
import { useState } from 'react';
import {
  RULE_LABEL,
  type Adoption,
  type MasterUsage,
  type ProbeSummary,
  type RuleOutcome,
  type RuleSummary,
} from '../../shared/probe';
import {
  Button,
  Card,
  Field,
  Kpi,
  Modal,
  Note,
  pct,
  Pill,
  Row,
  StackedBar,
  Table,
} from './primitives';

/* ---------- 1. Сводка ---------- */

export function SummaryTab({
  summary,
  adoption,
  onGoTo,
}: {
  summary: ProbeSummary;
  adoption: Adoption;
  onGoTo: (tab: 'Компоненты' | 'Токены' | 'Проверки') => void;
}): JSX.Element {
  const instances = adoption.instancesCounted;
  const tokenNodes =
    adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable + adoption.nodesWithoutVariable;
  const onTokens = adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          label="Компонентов"
          value={adoption.mastersTotal.toLocaleString('ru')}
          hint={`${instances.toLocaleString('ru')} копий на странице`}
        />
        <Kpi
          label="Из библиотеки"
          value={pct(adoption.fromLibrary, instances)}
          hint={`${adoption.fromLibrary.toLocaleString('ru')} копий`}
        />
        <Kpi
          label="На токенах"
          value={pct(onTokens, tokenNodes)}
          hint={`${adoption.nodesWithoutVariable.toLocaleString('ru')} слоёв без токена`}
        />
        <Kpi
          label="Оторвано"
          value={adoption.detachedCandidates.toLocaleString('ru')}
          hint="похоже на копии вне библиотеки"
        />
      </div>

      <Card title="Откуда компоненты">
        <StackedBar
          segments={[
            { label: 'Из библиотеки', value: adoption.fromLibrary, className: 'bg-accent' },
            { label: 'Свои в этом файле', value: adoption.local, className: 'bg-warn' },
            { label: 'Библиотека отключена', value: adoption.unknown, className: 'bg-ink-faint' },
          ]}
        />
        {adoption.unknown > 0 && (
          <div className="mt-3">
            <Note>
              «Библиотека отключена» — копии, чей источник файлу больше не доступен. Это и есть
              зависимость от чужой системы.
            </Note>
          </div>
        )}
        <div className="mt-3">
          <Button variant="quiet" onClick={() => onGoTo('Компоненты')}>
            Все компоненты
          </Button>
        </div>
      </Card>

      <Card title="Откуда токены">
        <StackedBar
          segments={[
            {
              label: 'Из библиотеки',
              value: adoption.nodesOnLibraryVariable,
              className: 'bg-accent',
            },
            { label: 'Свои', value: adoption.nodesOnLocalVariable, className: 'bg-warn' },
            {
              label: 'Без токена',
              value: adoption.nodesWithoutVariable,
              className: 'bg-ink-faint',
            },
          ]}
        />
        <div className="mt-3">
          <Button variant="quiet" onClick={() => onGoTo('Токены')}>
            Все коллекции
          </Button>
        </div>
      </Card>

      {adoption.librarySourcesAvailable && adoption.libraries.length > 0 && (
        <Card title="Библиотеки">
          <Table head={['Название', 'Токенов']}>
            {adoption.libraries.map((library) => (
              <Row
                key={library.libraryName}
                cells={[library.libraryName, library.variables.toLocaleString('ru')]}
              />
            ))}
          </Table>
        </Card>
      )}

      {!adoption.librarySourcesAvailable && (
        <Card title="Библиотеки">
          <Note>Не удалось прочитать — это не значит, что библиотек нет.</Note>
        </Card>
      )}

      <Card title="Проверки">
        <p className="text-[13px] text-ink-soft">
          {summary.toJudge === 0
            ? 'Проверять на этом файле нечего.'
            : `Нашли ${summary.toJudge.toLocaleString('ru')} мест, которые стоит посмотреть.`}
        </p>
        <div className="mt-3">
          <Button variant="quiet" onClick={() => onGoTo('Проверки')}>
            Смотреть
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- 2. Таблицы ---------- */

export function ComponentsTab({ adoption }: { adoption: Adoption }): JSX.Element {
  const [selected, setSelected] = useState<MasterUsage | null>(null);

  if (adoption.masters.length === 0) {
    return (
      <Card>
        <Note>Копий компонентов не нашли.</Note>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Table head={['Компонент', 'Копий']}>
          {adoption.masters.map((master) => (
            <Row
              key={master.key}
              onClick={() => setSelected(master)}
              cells={[
                <div className="min-w-0">
                  <div className="truncate">{master.name}</div>
                  <div className="mt-1">
                    <OriginPill origin={master.origin} />
                  </div>
                </div>,
                <span className="font-medium">{master.instances.toLocaleString('ru')}</span>,
              ]}
            />
          ))}
        </Table>
      </Card>

      {selected !== null && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <Field label="Источник" value={<OriginPill origin={selected.origin} />} />
          <Field label="Копий" value={selected.instances.toLocaleString('ru')} />
          <Field
            label="Доля"
            value={`${pct(selected.instances, adoption.instancesCounted)} всех копий`}
          />
          <div className="mt-3">
            <Note>
              {selected.origin === 'library'
                ? 'Компонент берётся из подключённой библиотеки — так и должно быть.'
                : selected.origin === 'local'
                  ? 'Компонент собран прямо в этом файле, а не взят из библиотеки.'
                  : 'Источник недоступен: библиотека отключена от файла либо компонент удалён.'}
            </Note>
          </div>
        </Modal>
      )}
    </>
  );
}

export function TokensTab({ adoption }: { adoption: Adoption }): JSX.Element {
  if (adoption.collections.length === 0) {
    return (
      <Card>
        <Note>Коллекций токенов не нашли.</Note>
      </Card>
    );
  }

  return (
    <Card>
      <Table head={['Коллекция', 'Токенов']}>
        {adoption.collections.map((collection) => (
          <Row
            key={`${collection.name}-${collection.source}`}
            cells={[
              <div className="min-w-0">
                <div className="truncate">{collection.name}</div>
                <div className="mt-1">
                  <Pill tone={collection.isLocal ? 'plain' : 'accent'}>{collection.source}</Pill>
                </div>
              </div>,
              <span className="font-medium">{collection.variables.toLocaleString('ru')}</span>,
            ]}
          />
        ))}
      </Table>
      <div className="mt-3">
        <Note>
          «Библиотека не подключена» значит, что токен используется, а его источник файлу
          недоступен.
        </Note>
      </div>
    </Card>
  );
}

export function ChecksTab({ summary }: { summary: ProbeSummary }): JSX.Element {
  const [selected, setSelected] = useState<RuleSummary | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <ul className="flex flex-col">
          {summary.rules.map((rule) => (
            <li key={rule.rule}>
              <button
                className="flex w-full items-center gap-3 border-t border-canvas py-3 text-left first:border-0"
                onClick={() => setSelected(rule)}
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{RULE_LABEL[rule.rule]}</span>
                <OutcomePill outcome={rule.outcome} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Уровни токенов">
        <Note>{summary.layerNote}</Note>
      </Card>

      {selected !== null && (
        <Modal title={RULE_LABEL[selected.rule]} onClose={() => setSelected(null)}>
          <Field label="Итог" value={<OutcomePill outcome={selected.outcome} />} />
          {selected.outcome.status === 'measured' && (
            <>
              <Field label="Нашли" value={selected.outcome.hits.toLocaleString('ru')} />
              <Field label="Посмотреть" value={selected.outcome.sampled} />
            </>
          )}
          <Field label="Код правила" value={<code className="text-[12px]">{selected.rule}</code>} />
          <div className="mt-3">
            <Note>
              {selected.outcome.status === 'not-applicable'
                ? `Почему: ${selected.outcome.reason}.`
                : selected.outcome.status === 'empty'
                  ? selected.outcome.note
                  : 'Список мест — во вкладке CSV.'}
            </Note>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- мелочи ---------- */

function OriginPill({ origin }: { origin: MasterUsage['origin'] }): JSX.Element {
  if (origin === 'library') return <Pill tone="accent">из библиотеки</Pill>;
  if (origin === 'local') return <Pill tone="warn">свой</Pill>;
  return <Pill>библиотека отключена</Pill>;
}

function OutcomePill({ outcome }: { outcome: RuleOutcome }): JSX.Element {
  if (outcome.status === 'measured') {
    return <Pill tone="warn">{outcome.hits.toLocaleString('ru')}</Pill>;
  }
  if (outcome.status === 'empty') return <Pill tone="accent">всё чисто</Pill>;
  return <Pill>нечего проверять</Pill>;
}
