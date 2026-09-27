import { StringValueObject } from '@haskou/value-objects';

export class DeviceAuthorizationPayload extends StringValueObject {
  private static readonly MAX_LENGTH = 4096;

  public constructor(value: string | StringValueObject) {
    super(value, DeviceAuthorizationPayload.MAX_LENGTH);
  }
}
