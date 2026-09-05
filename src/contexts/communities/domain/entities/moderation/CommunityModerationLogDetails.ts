import { JsonObject } from '@app/shared/domain/serialization/JsonObject';

export class CommunityModerationLogDetails {
  private readonly values: JsonObject;

  constructor(values: Record<string, unknown>) {
    this.values = JsonObject.fromPrimitives(values);
  }

  public toPrimitives() {
    return this.values.toPrimitives();
  }
}
