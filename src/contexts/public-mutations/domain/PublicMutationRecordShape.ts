import { InvalidPublicMutationError } from './errors/InvalidPublicMutationError';
import { PublicMutationRecordShapeExtras } from './PublicMutationRecordShapeExtras';

/** Closed field set of a public record: unknown fields are never accepted. */
export class PublicMutationRecordShape {
  private static isObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  constructor(
    private readonly strings: string[],
    private readonly integers: string[],
    private readonly scopeType: string,
    private readonly extras: PublicMutationRecordShapeExtras = {},
  ) {}

  private optionalFields(): string[] {
    return [
      ...(this.extras.optionalIntegers ?? []),
      ...(this.extras.optionalObjects ?? []),
      ...(this.extras.optionalStrings ?? []),
    ];
  }

  private requiredFields(extra: string[]): string[] {
    return [
      ...this.strings,
      ...this.integers,
      ...(this.extras.putStrings ?? []),
      ...(this.extras.booleans ?? []),
      ...(this.extras.objects ?? []),
      ...(this.extras.arrays ?? []),
      'scopeType',
      ...extra,
    ];
  }

  private hasKeysOf(record: Record<string, unknown>, extra: string[]): boolean {
    const required = this.requiredFields(extra);
    const allowed = new Set([...required, ...this.optionalFields()]);

    return (
      required.every((field) => Object.hasOwn(record, field)) &&
      Object.keys(record).every((field) => allowed.has(field))
    );
  }

  private hasValidValues(record: Record<string, unknown>): boolean {
    return (
      record.scopeType === this.scopeType &&
      this.hasValidScalars(record) &&
      this.hasValidStructures(record)
    );
  }

  private hasValidScalars(record: Record<string, unknown>): boolean {
    const {
      booleans = [],
      optionalStrings = [],
      putStrings = [],
    } = this.extras;

    return (
      optionalStrings.every(
        (field) =>
          record[field] === undefined || typeof record[field] === 'string',
      ) &&
      [...this.strings, ...putStrings].every(
        (field) => typeof record[field] === 'string',
      ) &&
      this.integers.every((field) => Number.isSafeInteger(record[field])) &&
      booleans.every((field) => typeof record[field] === 'boolean')
    );
  }

  private hasValidStructures(record: Record<string, unknown>): boolean {
    const {
      arrays = [],
      objects = [],
      optionalIntegers = [],
      optionalObjects = [],
    } = this.extras;

    return (
      objects.every((field) =>
        PublicMutationRecordShape.isObject(record[field]),
      ) &&
      arrays.every((field) => Array.isArray(record[field])) &&
      optionalObjects.every(
        (field) =>
          record[field] === undefined ||
          record[field] === null ||
          PublicMutationRecordShape.isObject(record[field]),
      ) &&
      optionalIntegers.every(
        (field) =>
          record[field] === undefined ||
          record[field] === null ||
          Number.isSafeInteger(record[field]),
      )
    );
  }

  /** A put carries every non-string field; a tombstone only the strings and `removed: true`. */
  public assert(record: Record<string, unknown>): void {
    const tombstone = record.removed === true;
    const shape = tombstone
      ? new PublicMutationRecordShape(this.strings, [], this.scopeType)
      : this;

    if (!shape.hasKeysOf(record, tombstone ? ['removed'] : [])) {
      throw new InvalidPublicMutationError();
    }

    if (!shape.hasValidValues(record)) {
      throw new InvalidPublicMutationError();
    }
  }
}
