/**
 * Конфигурация правил: разбор, нормализация и хранение в документе.
 *
 * Вход недоверенный с двух сторон: `pluginData` мог записать плагин другой
 * версии, а импортируемый файл вообще писал человек. Поэтому разбор не
 * бросает исключений — он возвращает конфиг и список замечаний.
 */
import type { AuditConfig, RuleLevel, RuleSetting, ScanScope } from '../../shared/types';

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'error', 'warning', 'info'];
const SCOPES: readonly ScanScope[] = ['selection', 'page', 'file'];

/** Лимит plugin data — ~100 KB на запись. Держим запас на служебные поля. */
const MAX_CONFIG_BYTES = 90 * 1024;

export const CONFIG_KEY = 'audit-config';

export const DEFAULT_CONFIG: AuditConfig = {
  version: 1,
  extends: 'recommended',
  scope: { default: 'page' },
  rules: {},
  tokenLayers: {},
};

export interface ConfigProblem {
  /** Путь до места проблемы: `rules.tokens/raw-fill`. */
  readonly at: string;
  readonly message: string;
}

export interface ParseResult {
  readonly config: AuditConfig;
  /**
   * Что пришлось поправить. Не ошибки: разбор всегда возвращает рабочий
   * конфиг. Показывать в настройках, иначе правки исчезают молча.
   */
  readonly problems: readonly ConfigProblem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuleLevel(value: unknown): value is RuleLevel {
  return typeof value === 'string' && (RULE_LEVELS as readonly string[]).includes(value);
}

/**
 * Разбирает конфиг из произвольного JSON.
 *
 * Неизвестные id правил **сохраняются**, а не выбрасываются: конфиг общий на
 * команду, и у коллеги может стоять версия плагина новее. Выбросить их —
 * значит молча стереть чужие настройки при первом же сохранении.
 */
export function parseConfig(raw: unknown): ParseResult {
  const problems: ConfigProblem[] = [];
  const note = (at: string, message: string): void => {
    problems.push({ at, message });
  };

  if (!isRecord(raw)) {
    return {
      config: DEFAULT_CONFIG,
      problems: [{ at: '', message: 'Конфиг не является объектом — взяты значения по умолчанию.' }],
    };
  }

  if (raw['version'] !== 1) {
    note('version', `Ожидалась версия 1, получено ${JSON.stringify(raw['version'])}.`);
  }

  const extendsValue = typeof raw['extends'] === 'string' ? raw['extends'] : DEFAULT_CONFIG.extends;
  if (typeof raw['extends'] !== 'string' && raw['extends'] !== undefined) {
    note('extends', 'Значение не строка — взято «recommended».');
  }

  return {
    config: {
      version: 1,
      extends: extendsValue,
      scope: { default: parseScope(raw['scope'], note) },
      rules: parseRules(raw['rules'], note),
      tokenLayers: parseTokenLayers(raw['tokenLayers'], note),
      ...pickAuthorship(raw),
    },
    problems,
  };
}

function parseScope(raw: unknown, note: (at: string, m: string) => void): ScanScope {
  if (raw === undefined) return DEFAULT_CONFIG.scope.default;
  if (!isRecord(raw)) {
    note('scope', 'Ожидался объект — взят скоуп «page».');
    return DEFAULT_CONFIG.scope.default;
  }
  const value = raw['default'];
  if (typeof value === 'string' && (SCOPES as readonly string[]).includes(value)) {
    return value as ScanScope;
  }
  if (value !== undefined) {
    note('scope.default', `Неизвестный скоуп ${JSON.stringify(value)} — взят «page».`);
  }
  return DEFAULT_CONFIG.scope.default;
}

function parseRules(
  raw: unknown,
  note: (at: string, m: string) => void,
): Record<string, RuleSetting> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    note('rules', 'Ожидался объект — правила проигнорированы.');
    return {};
  }

  const rules: Record<string, RuleSetting> = {};
  for (const [ruleId, value] of Object.entries(raw)) {
    if (isRuleLevel(value)) {
      rules[ruleId] = value;
      continue;
    }
    if (Array.isArray(value) && isRuleLevel(value[0])) {
      const options: unknown = value[1];
      rules[ruleId] = isRecord(options) ? [value[0], options] : value[0];
      if (value.length > 1 && !isRecord(options)) {
        note(`rules.${ruleId}`, 'Опции не являются объектом — оставлен только уровень.');
      }
      continue;
    }
    note(`rules.${ruleId}`, `Непонятное значение ${JSON.stringify(value)} — правило пропущено.`);
  }
  return rules;
}

function parseTokenLayers(
  raw: unknown,
  note: (at: string, m: string) => void,
): Record<string, readonly string[]> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    note('tokenLayers', 'Ожидался объект — разметка слоёв пропущена.');
    return {};
  }

  const layers: Record<string, readonly string[]> = {};
  for (const [layer, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) {
      note(`tokenLayers.${layer}`, 'Ожидался список имён коллекций — слой пропущен.');
      continue;
    }
    const names = value.filter((name): name is string => typeof name === 'string');
    if (names.length !== value.length) {
      note(`tokenLayers.${layer}`, 'Часть значений не строки — они отброшены.');
    }
    layers[layer] = names;
  }
  return layers;
}

function pickAuthorship(raw: Record<string, unknown>): Partial<AuditConfig> {
  const result: { updatedBy?: string; updatedAt?: string } = {};
  if (typeof raw['updatedBy'] === 'string') result.updatedBy = raw['updatedBy'];
  if (typeof raw['updatedAt'] === 'string') result.updatedAt = raw['updatedAt'];
  return result;
}

/** Проставляет авторство. Мерджа нет — важна хотя бы видимость, кто последний писал. */
export function stampAuthorship(config: AuditConfig, author: string, now: Date): AuditConfig {
  return { ...config, updatedBy: author, updatedAt: now.toISOString() };
}

/** Куда писать конфиг. Отделено от `figma.*` ради тестируемости. */
export interface ConfigGateway {
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

export class ConfigTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`Конфиг занимает ${bytes} байт при лимите ${MAX_CONFIG_BYTES}.`);
    this.name = 'ConfigTooLargeError';
  }
}

export function loadConfig(gateway: ConfigGateway): ParseResult {
  const stored = gateway.getPluginData(CONFIG_KEY);
  if (stored === '') return { config: DEFAULT_CONFIG, problems: [] };

  try {
    return parseConfig(JSON.parse(stored));
  } catch {
    return {
      config: DEFAULT_CONFIG,
      problems: [
        { at: '', message: 'Конфиг в документе повреждён — взяты значения по умолчанию.' },
      ],
    };
  }
}

/**
 * Сохраняет конфиг в документ.
 *
 * Превышение лимита — исключение, а не тихое обрезание: молча потерянный
 * конфиг команды хуже явной ошибки.
 */
export function saveConfig(gateway: ConfigGateway, config: AuditConfig): void {
  const serialized = JSON.stringify(config);
  const bytes = utf8ByteLength(serialized);
  if (bytes > MAX_CONFIG_BYTES) throw new ConfigTooLargeError(bytes);
  gateway.setPluginData(CONFIG_KEY, serialized);
}

/**
 * Длина строки в байтах UTF-8.
 *
 * Считаем вручную: `TextEncoder` — часть DOM/Node, а plugin sandbox не даёт
 * гарантий на его наличие, и в `lib: ES2020` его типа тоже нет.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Экспорт в файл — с отступами, потому что этот JSON читают и правят руками. */
export function exportConfig(config: AuditConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
