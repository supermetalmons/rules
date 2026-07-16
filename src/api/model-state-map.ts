type ModelStateCell<V> = { value: V };
type ModelStateAccessor<V> = (token: symbol) => ModelStateCell<V> | undefined;

/** Internal state storage that remains stable across transparent proxies. */
export class ModelStateMap<K extends object, V> {
  readonly #stateKey = Symbol();
  readonly #accessToken = Symbol();
  readonly #fallback = new WeakMap<K, ModelStateCell<V>>();

  public get(key: K): V | undefined {
    return this.#cell(key)?.value;
  }

  public getOrInsert(key: K, create: () => V): V {
    const existing = this.#cell(key);
    if (existing !== undefined) return existing.value;

    const value = create();
    this.set(key, value);
    return value;
  }

  public set(key: K, value: V): void {
    const existing = this.#cell(key);
    if (existing !== undefined) {
      existing.value = value;
      return;
    }

    const cell = { value };
    if (!Object.isExtensible(key)) {
      this.#fallback.set(key, cell);
      return;
    }

    const accessToken = this.#accessToken;
    const access: ModelStateAccessor<V> = (token) =>
      token === accessToken ? cell : undefined;
    Object.defineProperty(key, this.#stateKey, {
      configurable: false,
      enumerable: false,
      value: access,
      writable: false,
    });
  }

  #cell(key: K): ModelStateCell<V> | undefined {
    const descriptor = Object.getOwnPropertyDescriptor(key, this.#stateKey);
    if (descriptor !== undefined) {
      const access = descriptor.value as ModelStateAccessor<V>;
      return access(this.#accessToken);
    }
    return this.#fallback.get(key);
  }
}
