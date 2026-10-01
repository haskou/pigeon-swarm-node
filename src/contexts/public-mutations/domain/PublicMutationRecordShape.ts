import { InvalidPublicMutationError } from './errors/InvalidPublicMutationError';

/** Closed field set of a public record: unknown fields are never accepted. */
export class PublicMutationRecordShape {
  constructor(
    private readonly strings: string[],
    private readonly integers: string[],
    private readonly scopeType: string,
  ) {}

  private hasExactly(
    record: Record<string, unknown>,
    extra: string[],
  ): boolean {
    const fields = [...this.strings, ...this.integers, 'scopeType', ...extra];

    return (
      Object.keys(record).length === fields.length &&
      fields.every((field) => Object.hasOwn(record, field))
    );
  }

  private hasValidValues(record: Record<string, unknown>): boolean {
    return (
      record.scopeType === this.scopeType &&
      this.strings.every((field) => typeof record[field] === 'string') &&
      this.integers.every((field) => Number.isSafeInteger(record[field]))
    );
  }

  /** A put carries `integers`; a tombstone carries only `removed: true`. */
  public assert(record: Record<string, unknown>): void {
    const tombstone = record.removed === true;
    const shape = tombstone
      ? new PublicMutationRecordShape(this.strings, [], this.scopeType)
      : this;

    if (!shape.hasExactly(record, tombstone ? ['removed'] : [])) {
      throw new InvalidPublicMutationError();
    }

    if (!shape.hasValidValues(record)) {
      throw new InvalidPublicMutationError();
    }
  }
}
