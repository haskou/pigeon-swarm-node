import { JsonObject } from '@app/shared/domain/serialization/JsonObject';

export class PrivateGenesisProjection {
  private readonly value: JsonObject;

  public constructor(value: Record<string, unknown>) {
    this.value = JsonObject.fromPrimitives(value);
  }

  public toPrimitives(): Record<string, unknown> {
    return this.value.toPrimitives();
  }
}
