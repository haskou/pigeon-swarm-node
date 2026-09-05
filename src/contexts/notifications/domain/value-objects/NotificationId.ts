import { ShortId } from '@haskou/value-objects';

export class NotificationId extends ShortId {
  public static generate(): NotificationId {
    return new NotificationId(ShortId.generate().valueOf());
  }
}
