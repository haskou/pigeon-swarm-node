/**
 * Admission control for records that arrive through replicated OrbitDB state.
 * Collections it governs only enter canonical projections, heads and raw reads
 * after it accepts them; everything else passes through untouched.
 *
 * Head keys are governed separately: a replicated head is cached under its own
 * key and under aliases derived from its content, so a gate that protects a
 * collection must also protect the head keys that mirror it.
 */
export abstract class OrbitDBMutationGate {
  public abstract governs(collection: string): boolean;

  public abstract accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean>;

  public abstract governsHead(key: string): boolean;

  public abstract acceptsHead(
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean>;
}
