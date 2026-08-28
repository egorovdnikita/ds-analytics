/**
 * Отчёт в Markdown — то, что уносят из плагина.
 *
 * Паспорт про релиз 3: «экспорт отчёта — то, что показывают руководству».
 * Формат выбран Markdown, а не CSV: это документ для чтения человеком, а
 * не таблица для обработки. Вставляется в Notion, Slack и почту как есть.
 *
 * Чистая функция без DOM: её можно проверить тестами, а не глазами.
 */
import type { ScanReport } from './adoption';
import { buildAdvice, verdict } from './advice';
import { deltaPoints, shortDate } from './snapshot';

function pct(part: number, total: number): string {
  if (total === 0) return '—';
  const value = (part / total) * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

const num = (value: number): string => value.toLocaleString('ru');

/**
 * Экранирование для ячейки таблицы: вертикальная черта в имени слоя
 * разломала бы разметку, а имена в Figma бывают любые.
 */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function toMarkdown(report: ScanReport, at: Date): string {
  const { adoption, trend } = report;
  const instances = adoption.instancesCounted;
  const onTokens = adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable;
  const fills = onTokens + adoption.nodesWithoutVariable;
  const lines: string[] = [];

  lines.push(`# Дизайн-система в файле «${report.fileName}»`);
  lines.push('');
  lines.push(`${verdict(adoption).text}.`);
  lines.push('');
  lines.push(
    `Замер ${shortDate(at.toISOString())}, охват «${report.scope}», ${num(report.nodesVisited)} слоёв.`,
  );
  if (report.cancelled) {
    lines.push('');
    lines.push('> Обход был остановлен — цифры неполные.');
  }

  lines.push('');
  lines.push('## Главное');
  lines.push('');
  lines.push('| Показатель | Значение |');
  lines.push('| --- | --- |');
  lines.push(
    `| Компонентов из библиотеки | ${pct(adoption.fromLibrary, instances)} · ${num(adoption.fromLibrary)} из ${num(instances)} копий |`,
  );
  lines.push(`| Слоёв на токенах | ${pct(onTokens, fills)} · ${num(onTokens)} из ${num(fills)} |`);
  lines.push(`| Разных компонентов | ${num(adoption.mastersTotal)} |`);
  lines.push(`| Копий без доступной библиотеки | ${num(adoption.unknown)} |`);

  const delta = deltaPoints(
    { part: adoption.fromLibrary, total: instances },
    trend.previous === null
      ? null
      : { part: trend.previous.fromLibrary, total: trend.previous.instances },
  );
  if (delta !== null && trend.previous !== null) {
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    const text = delta === 0 ? 'без изменений' : `${sign}${Math.abs(delta)} п.п.`;
    lines.push(`| Изменение с ${shortDate(trend.previous.at)} | ${text} |`);
  }

  const advice = buildAdvice(adoption);
  if (advice.length > 0) {
    lines.push('');
    lines.push('## С чего начать');
    lines.push('');
    for (const item of advice) {
      lines.push(`- **${item.title} — ${item.value}.** ${item.hint}`);
    }
  }

  const local = adoption.masters.filter((master) => master.origin !== 'library').slice(0, 10);
  if (local.length > 0) {
    lines.push('');
    lines.push('## Компоненты мимо библиотеки');
    lines.push('');
    lines.push('| Компонент | Источник | Копий |');
    lines.push('| --- | --- | --- |');
    for (const master of local) {
      const origin = master.origin === 'local' ? 'свой' : 'библиотека отключена';
      lines.push(`| ${cell(master.name)} | ${origin} | ${num(master.instances)} |`);
    }
  }

  if (adoption.librarySourcesAvailable && adoption.libraries.length > 0) {
    lines.push('');
    lines.push('## Библиотеки токенов');
    lines.push('');
    lines.push('| Библиотека | Токенов |');
    lines.push('| --- | --- |');
    for (const library of adoption.libraries) {
      lines.push(`| ${cell(library.libraryName)} | ${num(library.variables)} |`);
    }
  }

  if (trend.points.length >= 2) {
    lines.push('');
    lines.push('## Как менялось');
    lines.push('');
    lines.push('| Дата | Из библиотеки | На токенах |');
    lines.push('| --- | --- | --- |');
    for (const point of trend.points) {
      lines.push(
        `| ${shortDate(point.at)} | ${pct(point.fromLibrary, point.instances)} | ${pct(point.onTokens, point.fills)} |`,
      );
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}
