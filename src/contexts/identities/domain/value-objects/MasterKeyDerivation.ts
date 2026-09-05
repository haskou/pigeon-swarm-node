import { JsonObject } from '@app/shared/domain/serialization/JsonObject';
import { assert } from '@haskou/value-objects';

import { InvalidMasterKeyDerivationError } from '../errors/InvalidMasterKeyDerivationError';

export class MasterKeyDerivation {
  private static readonly MAX_SERIALIZED_LENGTH = 16_384;
  private readonly value: JsonObject;

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static normalize(value: Record<string, unknown>): JsonObject {
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

    return JsonObject.fromPrimitives(normalized);
  }

  public static fromPrimitives(
    primitives: Record<string, unknown>,
  ): MasterKeyDerivation {
    return new MasterKeyDerivation(primitives);
  }

  constructor(value: Record<string, unknown>) {
    this.value = MasterKeyDerivation.normalize(value);
  }

  public toPrimitives() {
    return this.value.toPrimitives();
  }
}
