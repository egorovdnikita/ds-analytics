/**
 * Диагностика прогона.
 *
 * Появилась после первого боевого замера: три правила выдали ноль, и по
 * одному нулю невозможно понять, файл чистый или пробник слеп. Счётчики
 * отвечают на этот вопрос до того, как дизайнер сядет судить.
 */

export interface Diagnostics {
  nodesTotal: number;
  /** Нод с хотя бы одним биндингом переменной. Ноль означает: переменных в файле не используют. */
  nodesWithAlias: number;
  /** Нод с привязанным стилем заливки. Их нельзя считать хардкодом. */
  nodesWithFillStyle: number;
  /** Нод внутри инстансов — их содержимое приходит из мастера, чинить их здесь нечем. */
  nodesInsideInstance: number;
  instancesTotal: number;
  /** Инстансы верхнего уровня — только для них резолвится мастер. */
  instancesTopLevel: number;
  localComponents: number;
  masterNames: number;
  localCollections: number;
  localVariables: number;
  collectionNames: string[];
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
export function explain(d: Diagnostics): string[] {
  const lines: string[] = [
    `# нод всего,${d.nodesTotal}`,
    `# нод внутри инстансов,${d.nodesInsideInstance}`,
    `# инстансов,${d.instancesTotal},из них верхнего уровня,${d.instancesTopLevel}`,
    `# локальных компонентов,${d.localComponents},имён мастеров найдено,${d.masterNames}`,
    `# нод с биндингом переменной,${d.nodesWithAlias}`,
    `# нод со стилем заливки,${d.nodesWithFillStyle}`,
    `# локальных коллекций,${d.localCollections},переменных,${d.localVariables}`,
    `# имена коллекций,${d.collectionNames.join(' | ') || '—'}`,
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
  if (d.localComponents === 0) {
    lines.push(
      '# ВЫВОД,локальных компонентов нет — это файл-потребитель, layer-violation по мастерам здесь не проверить',
    );
  }
  return lines;
}
