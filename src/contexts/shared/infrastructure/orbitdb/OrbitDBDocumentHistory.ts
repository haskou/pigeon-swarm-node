import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBEntry } from './OrbitDBEntry';
import { OrbitDBHistoryReplayObserver } from './OrbitDBHistoryReplayObserver';

export class OrbitDBDocumentHistory {
  private frontier = new Set<string>();
  private pending?: Promise<void>;
  private dirty = false;

  constructor(
    private readonly log: NonNullable<OrbitDBDatabase['log']>,
    private readonly notify: (
      value: unknown,
      scope: object,
    ) => void | Promise<void>,
    private readonly observers: () => OrbitDBHistoryReplayObserver[] = () => [],
  ) {}

  private hasVisited(entry: OrbitDBEntry, visited: Set<string>): boolean {
    return (
      !entry.hash || this.frontier.has(entry.hash) || visited.has(entry.hash)
    );
  }

  private async expandAncestors(
    entry: OrbitDBEntry,
    visited: Set<string>,
    stack: Array<{ entry: OrbitDBEntry; expanded: boolean }>,
  ): Promise<void> {
    for (const hash of entry.next ?? []) {
      if (this.frontier.has(hash) || visited.has(hash)) continue;

      const ancestor = await this.log.get!(hash);

      if (!ancestor) throw new Error('OrbitDB document history is incomplete');

      stack.push({ entry: ancestor, expanded: false });
    }
  }

  private async replayHeads(heads: OrbitDBEntry[]): Promise<void> {
    const visited = new Set<string>();
    const stack: Array<{ entry: OrbitDBEntry; expanded: boolean }> = heads.map(
      (entry) => ({
        entry,
        expanded: false,
      }),
    );

    while (stack.length > 0) {
      const { entry, expanded } = stack.pop()!;

      if (expanded) {
        await this.notify(entry.payload?.value, this);
        continue;
      }

      if (this.hasVisited(entry, visited)) continue;

      visited.add(entry.hash!);
      stack.push({ entry, expanded: true });
      await this.expandAncestors(entry, visited, stack);

      if (visited.size % 64 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  private async drain(): Promise<void> {
    while (this.dirty) {
      this.dirty = false;
      const heads = await this.log.heads();

      await this.replayHeads(heads);
      this.frontier = new Set(
        heads.flatMap((entry) => (entry.hash ? [entry.hash] : [])),
      );
    }
  }

  private async replay(): Promise<void> {
    const observers = this.observers();
    let success = false;
    const frontier = this.frontier;

    for (const observer of observers) observer.started(this);

    try {
      await this.drain();
      success = true;
    } finally {
      if (!success) this.frontier = frontier;
      for (const observer of observers) observer.finished(this, success);
    }
  }

  public refresh(): Promise<void> {
    this.dirty = true;
    this.pending ??= this.replay().finally(() => {
      this.pending = undefined;

      if (this.dirty) return this.refresh();
    });

    return this.pending;
  }
}
