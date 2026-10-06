import { OrbitDBMutationGate } from './OrbitDBMutationGate';

/** Combines gates; a record or head key is admitted only by every gate that governs it. */
export class CompositeOrbitDBMutationGate extends OrbitDBMutationGate {
  constructor(private readonly gates: OrbitDBMutationGate[]) {
    super();
  }

  public governs(collection: string): boolean {
    return this.gates.some((gate) => gate.governs(collection));
  }

  public async accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    for (const gate of this.gates) {
      if (gate.governs(collection) && !(await gate.accepts(collection, record)))
        return false;
    }

    return true;
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
