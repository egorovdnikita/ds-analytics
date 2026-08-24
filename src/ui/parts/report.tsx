/**
 * Экраны отчёта. Три уровня: сводка → таблицы → карточка по клику.
 * Тексты бытовые: «токен», «копия», «библиотека», без терминов из кода.
 */
import { useMemo, useState } from 'react';
import type { Adoption, MasterUsage } from '../../shared/adoption';
import {
  BarCell,
  Button,
  Card,
  Empty,
  Field,
  Kpi,
  Modal,
  Note,
  pct,
  Pill,
  Places,
  Ring,
  Row,
  Segmented,
  StackedBar,
  Table,
} from './primitives';

/* ---------- 1. Сводка ---------- */

export function SummaryScreen({
  adoption,
  onGoTo,
}: {
  adoption: Adoption;
  onGoTo: (tab: 'Компоненты' | 'Токены') => void;
}): JSX.Element {
  const instances = adoption.instancesCounted;
  const tokenNodes =
    adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable + adoption.nodesWithoutVariable;
  const onTokens = adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable;

  return (
    <div className="flex flex-col gap-3">
      {/* Два кольца — главный ответ файла одним взглядом. */}
      <Card>
        <div className="flex items-start justify-around">
          <Ring
            value={adoption.fromLibrary}
            total={instances}
            caption="компонентов из библиотеки"
          />
          <Ring value={onTokens} total={tokenNodes} caption="слоёв на токенах" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Kpi
          label="Компонентов"
          value={adoption.mastersTotal.toLocaleString('ru')}
          hint={`${instances.toLocaleString('ru')} копий`}
        />
        <Kpi
          label="Без библиотеки"
          value={adoption.unknown.toLocaleString('ru')}
          hint="копий, чей источник недоступен"
        />
      </div>

      <Card
        title="Откуда компоненты"
        action={
          <button className="text-[12px] text-accent-ink" onClick={() => onGoTo('Компоненты')}>
            все →
          </button>
        }
      >
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
      </Card>

      <Card
        title="Откуда токены"
        action={
          <button className="text-[12px] text-accent-ink" onClick={() => onGoTo('Токены')}>
            все →
          </button>
        }
      >
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
      </Card>

      {adoption.librarySourcesAvailable && adoption.libraries.length > 0 && (
        <Card title="Библиотеки">
          <Table head={['Название', 'Токенов']}>
            {adoption.libraries.map((library) => (
              <Row
                key={library.libraryName}
                cells={[
                  library.libraryName,
                  <BarCell
                    value={library.variables}
                    max={Math.max(...adoption.libraries.map((item) => item.variables))}
                  />,
                ]}
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
    </div>
  );
}

/* ---------- 2. Компоненты ---------- */

type MasterFilter = 'all' | 'library' | 'local' | 'unknown';
const MASTER_FILTERS: readonly { value: MasterFilter; label: string }[] = [
  { value: 'all', label: 'все' },
  { value: 'library', label: 'из библиотеки' },
  { value: 'local', label: 'свои' },
  { value: 'unknown', label: 'без связи' },
];

const PAGE_SIZE = 25;

export function ComponentsScreen({
  adoption,
  onReveal,
}: {
  adoption: Adoption;
  onReveal: (nodeId: string, pageId: string) => void;
}): JSX.Element {
  const [selected, setSelected] = useState<MasterUsage | null>(null);
  const [filter, setFilter] = useState<MasterFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return adoption.masters.filter(
      (master) =>
        (filter === 'all' || master.origin === filter) &&
        (needle === '' || master.name.toLowerCase().includes(needle)),
    );
  }, [adoption.masters, filter, query]);

  if (adoption.masters.length === 0) {
    return <Empty title="Копий компонентов нет" hint="В этом охвате не нашлось ни одной." />;
  }

  // Масштаб столбцов — по видимым строкам, а не по всему списку. Иначе
  // после фильтра все полоски схлопываются в невидимые огрызки.
  const max = visible[0]?.instances ?? 1;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Card>
          <input
            className="w-full rounded-pill bg-canvas px-3.5 py-2 text-[13px] outline-none placeholder:text-ink-faint"
            placeholder="Найти компонент"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
          <div className="mt-3 overflow-x-auto">
            <Segmented
              options={MASTER_FILTERS}
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
        </Card>

        {visible.length === 0 ? (
          <Empty title="Ничего не нашлось" hint="Попробуйте другое название или снимите фильтр." />
        ) : (
          <Card>
            <Table head={['Компонент', 'Копий']}>
              {visible.slice(0, limit).map((master) => (
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
                    <BarCell value={master.instances} max={max} tone={toneFor(master.origin)} />,
                  ]}
                />
              ))}
            </Table>

            {visible.length > limit && (
              <div className="mt-3 flex justify-center">
                <Button variant="quiet" onClick={() => setLimit(limit + PAGE_SIZE * 2)}>
                  Показать ещё · осталось {(visible.length - limit).toLocaleString('ru')}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

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

          <h4 className="mb-1 mt-4 text-[12px] text-ink-soft">
            Где посмотреть{' '}
            {selected.instances > selected.places.length && (
              <span className="text-ink-faint">· первые {selected.places.length}</span>
            )}
          </h4>
          <Places places={selected.places} onReveal={onReveal} />
        </Modal>
      )}
    </>
  );
}

/* ---------- 3. Токены ---------- */

export function TokensScreen({ adoption }: { adoption: Adoption }): JSX.Element {
  if (adoption.collections.length === 0) {
    return <Empty title="Коллекций токенов нет" hint="В файле не нашлось ни одной переменной." />;
  }

  const max = Math.max(...adoption.collections.map((collection) => collection.variables));

  return (
    <div className="flex flex-col gap-3">
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
                <BarCell
                  value={collection.variables}
                  max={max}
                  tone={collection.isLocal ? 'warn' : 'accent'}
                />,
              ]}
            />
          ))}
        </Table>
      </Card>
      <Note>
        «Библиотека не подключена» значит, что токен используется, а его источник файлу недоступен.
      </Note>
    </div>
  );
}

/* ---------- мелочи ---------- */

function toneFor(origin: MasterUsage['origin']): 'accent' | 'warn' | 'faint' {
  if (origin === 'library') return 'accent';
  if (origin === 'local') return 'warn';
  return 'faint';
}

function OriginPill({ origin }: { origin: MasterUsage['origin'] }): JSX.Element {
  if (origin === 'library') return <Pill tone="accent">из библиотеки</Pill>;
  if (origin === 'local') return <Pill tone="warn">свой</Pill>;
  return <Pill>библиотека отключена</Pill>;
}
