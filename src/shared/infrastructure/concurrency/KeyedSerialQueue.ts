import { AsyncLocalStorage } from 'node:async_hooks';

import KeyedSerialSectionIsNestedError from './KeyedSerialSectionIsNestedError';

/**
 * Runs actions one at a time per key, in arrival order; different keys run in
 * parallel. Actions on one key do not nest: running one from inside an open
 * action on the same key throws `KeyedSerialSectionIsNestedError` instead of
 * waiting on itself forever. An action closes when it settles, so work it left
 * running may still queue on its key.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  // The actions the running code was started in, outermost first.
  private readonly enteredSections = new AsyncLocalStorage<
    ReadonlyArray<{ readonly key: string; open: boolean }>
  >();

  public async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const entered = this.enteredSections.getStore() ?? [];

    if (entered.some((section) => section.open && section.key === key)) {
      throw new KeyedSerialSectionIsNestedError();
    }

    const previous = this.tails.get(key) ?? Promise.resolve();
    const { promise: current, resolve: release } =
      Promise.withResolvers<void>();
    const tail = previous.then(() => current);
    const section = { key, open: true };

    this.tails.set(key, tail);
    await previous;

    try {
      return await this.enteredSections.run([...entered, section], action);
    } finally {
      section.open = false;
      release();

      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
