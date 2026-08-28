/**
 * С чего начать: приоритеты, выведенные из отчёта.
 *
 * Дашборд, который показывает «75%» и не говорит, что с этим делать,
 * перекладывает работу на читателя. Здесь цифры превращаются в конкретные
 * пункты: что именно не так, насколько это много и куда идти.
 *
 * Чистая функция без DOM и без `figma.*` — поэтому её можно проверить
 * тестами, а не глазами.
 */
import type { Adoption } from './adoption';
import { withCount } from './plural';

export type AdviceTarget =
  | { readonly kind: 'components'; readonly filter: 'local' | 'unknown' }
  | { readonly kind: 'tokens' }
  | { readonly kind: 'none' };

export interface Advice {
  readonly id: string;
  readonly title: string;
  /** Число, ради которого пункт вообще попал в список. */
  readonly value: string;
  readonly hint: string;
  readonly target: AdviceTarget;
  /** Насколько это срочно — определяет порядок. */
  readonly weight: number;
}

/** Ниже этой доли пункт не стоит внимания и только зашумляет список. */
const NOTICEABLE = 0.02;

function share(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function percent(part: number, total: number): string {
  const value = share(part, total) * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

/**
 * Пункты в порядке важности. Пустой список — это тоже ответ: значит
 * ничего заметного не нашлось, и так и надо сказать.
 */
export function buildAdvice(adoption: Adoption): readonly Advice[] {
  const advice: Advice[] = [];
  const instances = adoption.instancesCounted;
  const tokenNodes =
    adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable + adoption.nodesWithoutVariable;

  // Копии без доступного источника — самое неприятное: их нельзя обновить
  // вместе с библиотекой, и никто об этом не узнает.
  if (share(adoption.unknown, instances) >= NOTICEABLE) {
    advice.push({
      id: 'unknown-masters',
      title: 'Копии без библиотеки',
      value: adoption.unknown.toLocaleString('ru'),
      hint: 'Источник недоступен — такие копии не обновятся вместе с библиотекой.',
      target: { kind: 'components', filter: 'unknown' },
      weight: 100 * share(adoption.unknown, instances),
    });
  }

  // Локальные компоненты в продуктовом файле — обычно форк вместо библиотеки.
  if (share(adoption.local, instances) >= NOTICEABLE) {
    const top = adoption.masters.find((master) => master.origin === 'local');
    advice.push({
      id: 'local-masters',
      title: 'Компоненты мимо библиотеки',
      value: `${withCount(adoption.local, 'копия', 'копии', 'копий')} · ${percent(adoption.local, instances)}`,
      hint:
        top === undefined
          ? 'Собраны в этом файле, а не взяты из библиотеки.'
          : `Больше всего у «${top.name}» — ${withCount(top.instances, 'копия', 'копии', 'копий')}.`,
      target: { kind: 'components', filter: 'local' },
      weight: 60 * share(adoption.local, instances),
    });
  }

  // Токены из отключённой библиотеки — тихая зависимость от чужой системы.
  const orphanCollections = adoption.collections.filter(
    (collection) => !collection.isLocal && collection.source === 'Библиотека не подключена',
  );
  if (orphanCollections.length > 0) {
    const variables = orphanCollections.reduce((sum, item) => sum + item.variables, 0);
    advice.push({
      id: 'orphan-collections',
      title: 'Токены из отключённой библиотеки',
      value: variables.toLocaleString('ru'),
      hint: `Коллекций: ${orphanCollections.map((item) => item.name).join(', ')}.`,
      target: { kind: 'tokens' },
      weight: 80,
    });
  }

  // Слои с цветом, но без токена — потенциал токенизации.
  if (share(adoption.nodesWithoutVariable, tokenNodes) >= 0.2) {
    advice.push({
      id: 'no-tokens',
      title: 'Цвета без токенов',
      value: withCount(adoption.nodesWithoutVariable, 'слой', 'слоя', 'слоёв'),
      hint: `Это ${percent(adoption.nodesWithoutVariable, tokenNodes)} слоёв с заливкой. При смене темы они не переключатся.`,
      target: { kind: 'none' },
      weight: 40 * share(adoption.nodesWithoutVariable, tokenNodes),
    });
  }

  return advice.sort((a, b) => b.weight - a.weight);
}

/**
 * Одна фраза о состоянии файла — то, что читают первым.
 *
 * Порог 80% не выдуман на месте: ниже него доля «своих» и «ничьих»
 * компонентов перестаёт быть исключением и становится нормой файла.
 */
export function verdict(adoption: Adoption): { text: string; tone: 'good' | 'warn' } {
  const instances = adoption.instancesCounted;
  if (instances === 0) {
    return { text: 'Копий компонентов в этом охвате нет', tone: 'warn' };
  }

  const fromLibrary = share(adoption.fromLibrary, instances);
  if (fromLibrary >= 0.8) {
    return { text: 'Файл держится на дизайн-системе', tone: 'good' };
  }
  if (fromLibrary >= 0.5) {
    return { text: 'Дизайн-система используется наполовину', tone: 'warn' };
  }
  return { text: 'Большая часть собрана мимо дизайн-системы', tone: 'warn' };
}
