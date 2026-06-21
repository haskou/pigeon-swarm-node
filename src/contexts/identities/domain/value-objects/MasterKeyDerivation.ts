import { assert, ValueObject } from '@haskou/value-objects';

import { InvalidMasterKeyDerivationError } from '../errors/InvalidMasterKeyDerivationError';

export class MasterKeyDerivation extends ValueObject<Record<string, unknown>> {
  private static readonly MAX_SERIALIZED_LENGTH = 16_384;

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static normalize(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    assert(
      typeof value === 'object' && value !== null && !Array.isArray(value),
      new InvalidMasterKeyDerivationError(),
    );

    let serialized: string;

    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new InvalidMasterKeyDerivationError();
    }

    assert(
      serialized !== '{}' &&
        serialized.length <= MasterKeyDerivation.MAX_SERIALIZED_LENGTH,
      new InvalidMasterKeyDerivationError(),
    );

    const normalized: unknown = JSON.parse(serialized);

    if (!MasterKeyDerivation.isRecord(normalized)) {
      throw new InvalidMasterKeyDerivationError();
    }

    return normalized;
  }

  public static fromPrimitives(
    primitives: Record<string, unknown>,
  ): MasterKeyDerivation {
    return new MasterKeyDerivation(primitives);
  }

  constructor(value: Record<string, unknown>) {
    super(MasterKeyDerivation.normalize(value));
  }

  public toPrimitives(): Record<string, unknown> {
    return this.valueOf();
  }
}
