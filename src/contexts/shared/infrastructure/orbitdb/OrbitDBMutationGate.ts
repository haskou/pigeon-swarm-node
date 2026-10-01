/**
 * Admission control for records that arrive through replicated OrbitDB state.
 * Collections it governs only enter canonical projections, heads and raw reads
 * after it accepts them; everything else passes through untouched.
 */
export abstract class OrbitDBMutationGate {
  public abstract governs(collection: string): boolean;

  public abstract accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean>;
}
