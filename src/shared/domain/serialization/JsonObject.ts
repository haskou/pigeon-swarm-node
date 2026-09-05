import { InvalidFormatError } from '@haskou/value-objects';

import type { JsonValue } from './JsonValue';

export class JsonObject {
  private static isJsonValue(value: unknown): value is JsonValue {
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (Array.isArray(value) &&
        value.every((item) => JsonObject.isJsonValue(item))) ||
      JsonObject.isJsonObject(value)
    );
  }

  private static isJsonObject(
    value: unknown,
  ): value is { [key: string]: JsonValue } {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every((item) => JsonObject.isJsonValue(item))
    );
  }

  public static fromPrimitives(value: unknown): JsonObject {
    try {
      const serialized = JSON.stringify(value);
      const parsed: unknown = JSON.parse(serialized);

      if (JsonObject.isJsonObject(parsed)) {
        return new JsonObject(serialized);
      }
    } catch {
      throw new InvalidFormatError('Expected a serializable JSON object');
    }

    throw new InvalidFormatError('Expected a serializable JSON object');
  }

  private constructor(private readonly serialized: string) {}

  public toPrimitives(): { [key: string]: JsonValue } {
    const value: unknown = JSON.parse(this.serialized);

    if (!JsonObject.isJsonObject(value)) {
      throw new InvalidFormatError('Expected a serializable JSON object');
    }

    return value;
  }
}
