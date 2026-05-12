import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidConversationTypeError } from '../errors/InvalidConversationTypeError';

export class ConversationType extends StringValueObject {
  private static readonly VALUES = ['one-to-one', 'group'];

  public static readonly GROUP = new ConversationType('group');
  public static readonly ONE_TO_ONE = new ConversationType('one-to-one');

  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      ConversationType.VALUES.includes(this.valueOf()),
      new InvalidConversationTypeError(),
    );
  }

  public isEqual(other: ConversationType): boolean {
    return this.valueOf() === other.valueOf();
  }
}
