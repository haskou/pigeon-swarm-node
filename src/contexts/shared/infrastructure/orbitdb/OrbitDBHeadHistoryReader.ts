import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBEntry } from './OrbitDBEntry';

export default class OrbitDBHeadHistoryReader {
  constructor(private readonly log: NonNullable<OrbitDBDatabase['log']>) {}

  private async appendAncestors(
    entry: OrbitDBEntry,
    visited: Set<string>,
    pending: OrbitDBEntry[],
  ): Promise<void> {
    for (const hash of entry.next ?? []) {
      if (visited.has(hash)) continue;
      const ancestor = await this.log.get!(hash);

      if (!ancestor) throw new Error('OrbitDB head history is incomplete');
      pending.push(ancestor);
    }
  }

  public async *entries(): AsyncGenerator<OrbitDBEntry> {
    if (!this.log.get) return;
    const pending = await this.log.heads();
    const visited = new Set<string>();

    while (pending.length > 0) {
      const entry = pending.pop()!;

      if (!entry.hash || visited.has(entry.hash)) continue;
      visited.add(entry.hash);
      yield entry;

      await this.appendAncestors(entry, visited, pending);

      if (visited.size % 64 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
