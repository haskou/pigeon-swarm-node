import { Enum } from '@haskou/value-objects';

enum NetworkTypeEnum {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export class NetworkType extends Enum<string> {
  public static PUBLIC = new NetworkType(NetworkTypeEnum.PUBLIC);
  public static PRIVATE = new NetworkType(NetworkTypeEnum.PRIVATE);

  public getValues(): string[] {
    return Object.values(NetworkTypeEnum);
  }
}
