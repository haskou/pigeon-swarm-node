import { InvalidPublicMutationError } from './errors/InvalidPublicMutationError';

/** Put-only fields beyond strings and integers. */
export interface PublicMutationRecordShapeExtras {
  booleans?: string[];
  /** Integer, or null, or absent. */
  optionalIntegers?: string[];
  /** Plain JSON objects whose inner shape the policy validates itself. */
  objects?: string[];
  /** Plain JSON object, or null, or absent. */
  optionalObjects?: string[];
  /** Strings that only a put carries. */
  putStrings?: string[];
  /** Plain JSON arrays whose items the policy validates itself. */
  arrays?: string[];
}

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

  private hasKeysOf(record: Record<string, unknown>, extra: string[]): boolean {
    const optional = [
      ...(this.extras.optionalIntegers ?? []),
      ...(this.extras.optionalObjects ?? []),
    ];
    const required = [
      ...this.strings,
      ...this.integers,
      ...(this.extras.putStrings ?? []),
      ...(this.extras.booleans ?? []),
      ...(this.extras.objects ?? []),
      ...(this.extras.arrays ?? []),
      'scopeType',
      ...extra,
    ];
    const allowed = new Set([...required, ...optional]);

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
    const { booleans = [], putStrings = [] } = this.extras;

    return (
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
