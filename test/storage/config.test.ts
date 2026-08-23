import { describe, expect, it } from 'vitest';
import {
  CONFIG_KEY,
  ConfigTooLargeError,
  DEFAULT_CONFIG,
  exportConfig,
  loadConfig,
  parseConfig,
  saveConfig,
  stampAuthorship,
  type ConfigGateway,
} from '../../src/main/storage/config';

function gateway(initial = ''): ConfigGateway & { stored: string } {
  return {
    stored: initial,
    getPluginData(key) {
      return key === CONFIG_KEY ? this.stored : '';
    },
    setPluginData(key, value) {
      if (key === CONFIG_KEY) this.stored = value;
    },
  };
}

describe('parseConfig', () => {
  it('разбирает конфиг из паспорта проекта', () => {
    const { config, problems } = parseConfig({
      version: 1,
      extends: 'recommended',
      scope: { default: 'page' },
      rules: {
        'tokens/raw-fill': 'error',
        'structure/default-name': 'off',
        'a11y/token-pair-contrast': ['warning', { level: 'AA' }],
      },
      tokenLayers: { primitives: ['Primitives', 'Palette'], semantic: ['Semantic'] },
    });

    expect(problems).toEqual([]);
    expect(config.rules['tokens/raw-fill']).toBe('error');
    expect(config.rules['structure/default-name']).toBe('off');
    expect(config.rules['a11y/token-pair-contrast']).toEqual(['warning', { level: 'AA' }]);
    expect(config.tokenLayers['primitives']).toEqual(['Primitives', 'Palette']);
  });

  it('на мусоре вместо объекта отдаёт дефолт с замечанием', () => {
    const { config, problems } = parseConfig('не объект');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(problems).toHaveLength(1);
  });

  it('сохраняет неизвестные id правил', () => {
    // Конфиг общий на команду: у коллеги может стоять версия новее.
    // Выбросить неизвестное правило — молча стереть его настройку.
    const { config, problems } = parseConfig({
      version: 1,
      rules: { 'future/unknown-rule': 'warning' },
    });

    expect(config.rules['future/unknown-rule']).toBe('warning');
    expect(problems).toEqual([]);
  });

  it('пропускает правило с непонятным значением и сообщает об этом', () => {
    const { config, problems } = parseConfig({
      version: 1,
      rules: { 'tokens/raw-fill': 'error', 'tokens/broken': 42 },
    });

    expect(config.rules['tokens/raw-fill']).toBe('error');
    expect(config.rules['tokens/broken']).toBeUndefined();
    expect(problems[0]?.at).toBe('rules.tokens/broken');
  });

  it('роняет опции, если это не объект, но уровень оставляет', () => {
    const { config, problems } = parseConfig({
      version: 1,
      rules: { 'a11y/x': ['warning', 'AA'] },
    });

    expect(config.rules['a11y/x']).toBe('warning');
    expect(problems[0]?.at).toBe('rules.a11y/x');
  });

  it('неизвестный скоуп заменяется на page', () => {
    const { config, problems } = parseConfig({ version: 1, scope: { default: 'universe' } });

    expect(config.scope.default).toBe('page');
    expect(problems[0]?.at).toBe('scope.default');
  });

  it('отбрасывает нестроковые имена коллекций в слоях', () => {
    const { config, problems } = parseConfig({
      version: 1,
      tokenLayers: { semantic: ['Semantic', 7, null] },
    });

    expect(config.tokenLayers['semantic']).toEqual(['Semantic']);
    expect(problems[0]?.at).toBe('tokenLayers.semantic');
  });

  it('сообщает о чужой версии, но конфиг всё равно отдаёт', () => {
    const { config, problems } = parseConfig({ version: 2, rules: { 'tokens/raw-fill': 'error' } });

    expect(config.version).toBe(1);
    expect(config.rules['tokens/raw-fill']).toBe('error');
    expect(problems[0]?.at).toBe('version');
  });
});

describe('авторство', () => {
  it('проставляет кто и когда', () => {
    const stamped = stampAuthorship(DEFAULT_CONFIG, 'Никита', new Date('2026-08-23T10:00:00Z'));

    expect(stamped.updatedBy).toBe('Никита');
    expect(stamped.updatedAt).toBe('2026-08-23T10:00:00.000Z');
  });

  it('переживает круг сохранение → загрузка', () => {
    const g = gateway();
    saveConfig(g, stampAuthorship(DEFAULT_CONFIG, 'Аня', new Date('2026-08-23T10:00:00Z')));

    expect(loadConfig(g).config.updatedBy).toBe('Аня');
  });
});

describe('хранение', () => {
  it('пустой документ даёт дефолтный конфиг без замечаний', () => {
    expect(loadConfig(gateway())).toEqual({ config: DEFAULT_CONFIG, problems: [] });
  });

  it('повреждённый JSON не роняет плагин', () => {
    const { config, problems } = loadConfig(gateway('{ это не json'));

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(problems).toHaveLength(1);
  });

  it('превышение лимита plugin data — исключение, а не тихое обрезание', () => {
    const huge = {
      ...DEFAULT_CONFIG,
      rules: Object.fromEntries(
        Array.from({ length: 8000 }, (_, i) => [`tokens/rule-${i}`, 'error' as const]),
      ),
    };

    expect(() => saveConfig(gateway(), huge)).toThrow(ConfigTooLargeError);
  });

  it('считает длину в байтах UTF-8, а не в символах', () => {
    // Кириллица — два байта на символ. Конфиг из символов, влезающих
    // по длине строки, но не влезающих по байтам, должен быть отклонён.
    const cyrillic = {
      ...DEFAULT_CONFIG,
      tokenLayers: { semantic: [Array.from({ length: 50000 }, () => 'я').join('')] },
    };

    expect(() => saveConfig(gateway(), cyrillic)).toThrow(ConfigTooLargeError);
  });
});

describe('экспорт', () => {
  it('отдаёт читаемый JSON с переводом строки в конце', () => {
    const text = exportConfig(DEFAULT_CONFIG);

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "extends": "recommended"');
    expect(parseConfig(JSON.parse(text)).config).toEqual(DEFAULT_CONFIG);
  });
});
