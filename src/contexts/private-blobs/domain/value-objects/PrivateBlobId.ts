import { StringValueObject, UUID } from '@haskou/value-objects';

export class PrivateBlobId extends StringValueObject {
  public static generate(): PrivateBlobId {
    return new PrivateBlobId(UUID.generate().valueOf());
  }
}
