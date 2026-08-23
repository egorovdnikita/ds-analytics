import type { Diagnostics } from '../../shared/probe';

/**
 * Диагностика прогона.
 *
 * Появилась после первого боевого замера: три правила выдали ноль, и по
 * одному нулю невозможно понять, файл чистый или пробник слеп. Счётчики
 * отвечают на этот вопрос до того, как дизайнер сядет судить.
 */

/**
 * Грубая проверка: похожи ли имена коллекций на разметку по слоям.
 *
 * Ищем корни, а не точные имена: на этом шаге важно не сопоставить слой,
 * а понять, есть ли вообще намёк на слоистую структуру.
 */
function looksLayered(names: readonly string[]): boolean {
  const roots = [
    'primitive',
    'palette',
    'core',
    'semantic',
    'theme',
    'token',
    'component',
    'alias',
  ];
  return names.some((name) => {
    const lower = name.toLowerCase();
    return roots.some((root) => lower.includes(root));
  });
}

export function emptyDiagnostics(): Diagnostics {
  return {
    nodesTotal: 0,
    nodesWithAlias: 0,
    nodesWithFillStyle: 0,
    nodesInsideInstance: 0,
    instancesTotal: 0,
    instancesTopLevel: 0,
    localComponents: 0,
    masterNames: 0,
    localCollections: 0,
    localVariables: 0,
    collectionNames: [],
  };
}

/**
 * Читаемый вывод для шапки CSV.
 *
 * Строки-подсказки не украшение: без них ноль в отчёте читается как
 * «проблем нет», а он чаще означает «здесь нечего искать».
 */
/**
 * Схлопывает одинаковые имена в «Имя ×N».
 *
 * Несколько коллекций с одним именем — не ошибка вывода, а факт о файле:
 * три разные коллекции, все названные «Collection 1». Терять этот факт
 * нельзя, но и печатать имя трижды подряд бессмысленно.
 */
function formatCollectionNames(names: readonly string[]): string {
  if (names.length === 0) return '—';

  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(' | ');
}

export function explain(d: Diagnostics): string[] {
  const lines: string[] = [
    `# нод всего,${d.nodesTotal}`,
    `# нод внутри инстансов,${d.nodesInsideInstance}`,
    `# инстансов,${d.instancesTotal},из них верхнего уровня,${d.instancesTopLevel}`,
    `# локальных компонентов,${d.localComponents},имён мастеров найдено,${d.masterNames}`,
    `# нод с биндингом переменной,${d.nodesWithAlias}`,
    `# нод со стилем заливки,${d.nodesWithFillStyle}`,
    `# локальных коллекций,${d.localCollections},переменных,${d.localVariables}`,
    `# имена коллекций,${formatCollectionNames(d.collectionNames)}`,
  ];

  if (d.nodesWithAlias === 0) {
    lines.push(
      '# ВЫВОД,переменные в скоупе не используются — layer-violation и broken-alias неприменимы здесь',
    );
  }
  if (d.masterNames === 0) {
    lines.push('# ВЫВОД,мастеров компонентов не найдено — detached-instance неприменим здесь');
  }
  if (d.collectionNames.length === 0 && d.nodesWithAlias > 0) {
    lines.push(
      '# ВЫВОД,коллекции переменных не разрезолвились — слой определить нельзя, layer-violation неприменим',
    );
  }
  // Разметка слоёв — главный вопрос шага A2 протокола. Ответ на него даёт
  // не число коллекций, а их имена: если по ним слой не читается, правило
  // layer-violation неприменимо из коробки на любом файле этой команды.
  if (d.collectionNames.length > 0 && !looksLayered(d.collectionNames)) {
    lines.push(
      '# ВЫВОД,имена коллекций не читаются как слои ДС — layer-violation потребует ручной разметки на каждом файле',
    );
  }
  if (d.localComponents === 0) {
    lines.push(
      '# ВЫВОД,локальных компонентов нет — это файл-потребитель, layer-violation по мастерам здесь не проверить',
    );
  }
  return lines;
}
