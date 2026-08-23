/**
 * Индекс переменных с явной моделью трёх состояний.
 *
 * Реализует решение 0004. Главное свойство: `resolve` синхронный — правила
 * читают готовый индекс и не делают async-вызовов внутри `check`.
 */

export type TokenLayer = 'primitives' | 'semantic' | 'component';

export type TokenLayerConfig = Readonly<Partial<Record<TokenLayer, readonly string[]>>>;

export type ResolvedVariable =
  | {
      readonly state: 'local' | 'library';
      readonly id: string;
      readonly name: string;
      readonly collectionId: string;
      readonly collectionName: string;
      /** null, если коллекция не размечена по слоям в конфиге. */
      readonly layer: TokenLayer | null;
    }
  | {
      /**
       * Переменная недоступна плагину. Это НЕ то же самое, что «удалена»:
       * отличить одно от другого нельзя, поэтому правила обязаны молчать.
       */
      readonly state: 'unavailable';
      readonly id: string;
    };

/** Минимальный контракт Figma API, нужный резолверу. Упрощает тесты. */
export interface VariablesGateway {
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  getLocalVariablesAsync(): Promise<Variable[]>;
  getVariableByIdAsync(id: string): Promise<Variable | null>;
  getVariableCollectionByIdAsync(id: string): Promise<VariableCollection | null>;
}

interface CollectionInfo {
  readonly id: string;
  readonly name: string;
  readonly layer: TokenLayer | null;
}

const LAYERS: readonly TokenLayer[] = ['primitives', 'semantic', 'component'];

export class VariableResolver {
  readonly #byId = new Map<string, ResolvedVariable>();
  readonly #collections = new Map<string, CollectionInfo>();
  readonly #layerConfig: TokenLayerConfig;
  readonly #gateway: VariablesGateway;

  private constructor(gateway: VariablesGateway, layerConfig: TokenLayerConfig) {
    this.#gateway = gateway;
    this.#layerConfig = layerConfig;
  }

  /**
   * Фаза 1: локальный индекс. Строится до обхода дерева.
   * Библиотечные переменные здесь ещё неизвестны — см. `hydrate`.
   */
  static async build(
    gateway: VariablesGateway,
    layerConfig: TokenLayerConfig = {},
  ): Promise<VariableResolver> {
    const resolver = new VariableResolver(gateway, layerConfig);

    const collections = await gateway.getLocalVariableCollectionsAsync();
    for (const collection of collections) {
      resolver.#collections.set(collection.id, {
        id: collection.id,
        name: collection.name,
        layer: resolver.#layerOfName(collection.name),
      });
    }

    const variables = await gateway.getLocalVariablesAsync();
    for (const variable of variables) resolver.#index(variable);

    return resolver;
  }

  /**
   * Фаза 3: догружает переменные, встреченные в биндингах, но отсутствующие
   * в локальном индексе — то есть библиотечные.
   *
   * Ошибка на конкретном id трактуется как `unavailable`: один сломанный
   * биндинг не должен ронять скан целиком.
   */
  async hydrate(ids: Iterable<string>): Promise<void> {
    const unknown = [...new Set(ids)].filter((id) => !this.#byId.has(id));

    for (const id of unknown) {
      try {
        const variable = await this.#gateway.getVariableByIdAsync(id);
        if (variable === null) {
          this.#byId.set(id, { state: 'unavailable', id });
          continue;
        }
        // Коллекция библиотечной переменной не попадает в локальный индекс,
        // а без неё не определить слой — и layer-violation молча не работает
        // на любом файле-потребителе. Найдено боевым замером.
        await this.#ensureCollection(variable.variableCollectionId);
        this.#index(variable);
      } catch {
        this.#byId.set(id, { state: 'unavailable', id });
      }
    }
  }

  /** Синхронный доступ. Неизвестный id — `unavailable`, не исключение. */
  resolve(id: string): ResolvedVariable {
    return this.#byId.get(id) ?? { state: 'unavailable', id };
  }

  /**
   * Можно ли выносить вердикт об этой переменной.
   *
   * Правило `broken-alias` спрашивает именно это, а не проверяет `null`
   * самостоятельно: недоступная переменная — ограничение плагина, а не
   * проблема файла, и молчать про неё должно быть решением по умолчанию.
   */
  canJudge(id: string): boolean {
    return this.resolve(id).state !== 'unavailable';
  }

  /**
   * Размечены ли слои в конфиге. Если нет — `tokens/layer-violation`
   * отключается, а не гадает (требование паспорта).
   */
  get areLayersConfigured(): boolean {
    return LAYERS.some((layer) => (this.#layerConfig[layer]?.length ?? 0) > 0);
  }

  get size(): number {
    return this.#byId.size;
  }

  /**
   * Догружает коллекцию, если её нет в локальном индексе.
   *
   * Недоступная коллекция — не ошибка: слой останется `null`, и правила,
   * зависящие от слоя, промолчат.
   */
  async #ensureCollection(collectionId: string): Promise<void> {
    if (this.#collections.has(collectionId)) return;
    try {
      const collection = await this.#gateway.getVariableCollectionByIdAsync(collectionId);
      if (collection === null) return;
      this.#collections.set(collection.id, {
        id: collection.id,
        name: collection.name,
        layer: this.#layerOfName(collection.name),
      });
    } catch {
      // Коллекция недоступна — слой не определить, и это нормально.
    }
  }

  /**
   * Сколько переменных попало в каждый слой.
   *
   * Без этого «нарушений слоёв не найдено» непроверяемо: ноль нарушений при
   * нуле примитивных переменных означает не здоровую систему, а то, что
   * правилу нечего было нарушать.
   */
  countByLayer(): Readonly<Record<TokenLayer | 'unmapped', number>> {
    const counts = { primitives: 0, semantic: 0, component: 0, unmapped: 0 };
    for (const resolved of this.#byId.values()) {
      if (resolved.state === 'unavailable') continue;
      if (resolved.layer === null) counts.unmapped++;
      else counts[resolved.layer]++;
    }
    return counts;
  }

  /** Имена коллекций, которые удалось сопоставить слою. */
  layeredCollectionNames(): readonly string[] {
    return [...this.#collections.values()]
      .filter((collection) => collection.layer !== null)
      .map((collection) => collection.name);
  }

  /** Имена всех известных коллекций — локальных и догруженных библиотечных. */
  get collectionNames(): readonly string[] {
    return [...this.#collections.values()].map((collection) => collection.name);
  }

  /**
   * Если коллекцию не удалось догрузить, `collectionName` остаётся пустым,
   * а `layer` — null. Правило `layer-violation` для такой переменной обязано
   * молчать, а не считать отсутствие слоя нарушением.
   */
  #index(variable: Variable): void {
    const collection = this.#collections.get(variable.variableCollectionId);
    this.#byId.set(variable.id, {
      state: variable.remote ? 'library' : 'local',
      id: variable.id,
      name: variable.name,
      collectionId: variable.variableCollectionId,
      collectionName: collection?.name ?? '',
      layer: collection?.layer ?? null,
    });
  }

  #layerOfName(collectionName: string): TokenLayer | null {
    const needle = collectionName.trim().toLowerCase();
    for (const layer of LAYERS) {
      const names = this.#layerConfig[layer] ?? [];
      // Точное совпадение, не подстрока: «Semantic» не должен матчить
      // «Semantic Legacy» — это тихая и потому опасная ошибка.
      if (names.some((name) => name.trim().toLowerCase() === needle)) return layer;
    }
    return null;
  }
}
