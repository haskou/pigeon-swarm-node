import { DomainError } from '@haskou/value-objects';

/** The record already has a mutation that outranks the submitted one. */
export class StalePublicMutationError extends DomainError {
  public constructor(
    public readonly current: { sequence: number; digest: string },
  ) {
    super('Stale public mutation');
  }

  public get details(): { sequence: number; digest: string } {
    return this.current;
  }
}
