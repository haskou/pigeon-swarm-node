import {
  OrbitDBMutationGate,
  OrbitDBMutationVerdict,
} from './OrbitDBMutationGate';

/**
 * Combines gates; a record or head key is admitted only by every gate that governs it.
 * A refusal from any governing gate refuses the record, and otherwise a pending gate holds it.
 */
export class CompositeOrbitDBMutationGate extends OrbitDBMutationGate {
  constructor(private readonly gates: OrbitDBMutationGate[]) {
    super();
  }

  public governs(collection: string): boolean {
    return this.gates.some((gate) => gate.governs(collection));
  }

  public async verdictOf(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<OrbitDBMutationVerdict> {
    let verdict: OrbitDBMutationVerdict = 'accepted';

    for (const gate of this.gates) {
      if (!gate.governs(collection)) continue;

      const next = await gate.verdictOf(collection, record);

      if (next === 'refused') return 'refused';

      if (next === 'pending') verdict = 'pending';
    }

    return verdict;
  }

  public governsHead(key: string): boolean {
    return this.gates.some((gate) => gate.governsHead(key));
  }

  public async acceptsHead(
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    for (const gate of this.gates) {
      if (gate.governsHead(key) && !(await gate.acceptsHead(key, record)))
        return false;
    }

    return true;
  }
}
