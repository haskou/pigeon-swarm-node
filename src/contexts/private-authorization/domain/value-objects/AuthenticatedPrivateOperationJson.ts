import { StringValueObject } from '@haskou/value-objects';

export class AuthenticatedPrivateOperationJson extends StringValueObject {
  private static readonly MAX_CANONICAL_JSON_CHARACTERS = 256 * 1_024;

  public constructor(value: string | StringValueObject) {
    super(
      value,
      AuthenticatedPrivateOperationJson.MAX_CANONICAL_JSON_CHARACTERS,
    );
  }
}
