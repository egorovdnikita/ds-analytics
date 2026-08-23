/**
 * CSV для судейства.
 *
 * Колонка «вердикт» пустая — её заполняет дизайнер по рубрике протокола.
 * Формат под вставку в таблицу, а не под чтение глазами в textarea.
 */
import type { Hit, ProbeRuleId } from './checks';
import type { Diagnostics } from '../../shared/probe';
import { explain } from './diagnostics';

export const VERDICT_HINT = 'реальная | ложная | намеренная';

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface ReportMeta {
  readonly fileName: string;
  readonly scope: string;
  readonly nodesVisited: number;
  readonly cancelled: boolean;
  readonly seed: number;
  readonly diagnostics: Diagnostics;
}

/**
 * Строит CSV из выборок по правилам.
 *
 * Полные количества срабатываний идут в шапку: доля судимых к общему числу
 * нужна, чтобы понимать, насколько выборка репрезентативна.
 */
export function buildCsv(
  sampled: ReadonlyMap<ProbeRuleId, readonly Hit[]>,
  totals: ReadonlyMap<ProbeRuleId, number>,
  meta: ReportMeta,
): string {
  const lines: string[] = [];

  lines.push(`# файл,${escapeCell(meta.fileName)}`);
  lines.push(`# скоуп,${meta.scope}`);
  lines.push(`# нод пройдено,${meta.nodesVisited}`);
  lines.push(`# seed,${meta.seed}`);
  if (meta.cancelled) lines.push('# ВНИМАНИЕ,обход отменён — данные неполные');
  lines.push(...explain(meta.diagnostics));
  for (const [rule, total] of totals) {
    lines.push(`# всего срабатываний,${rule},${total},в выборке,${sampled.get(rule)?.length ?? 0}`);
  }
  lines.push('');
  lines.push(
    ['правило', 'страница', 'id ноды', 'имя ноды', 'что нашли', 'вердикт', 'заметка'].join(','),
  );

  for (const hits of sampled.values()) {
    for (const hit of hits) {
      lines.push(
        [
          hit.rule,
          hit.pageId,
          hit.nodeId,
          escapeCell(hit.nodeName),
          escapeCell(hit.detail),
          '',
          '',
        ].join(','),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
