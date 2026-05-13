import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidCallScopeError } from '../errors/InvalidCallScopeError';

export enum CallScopeTypeEnum {
  COMMUNITY_CHANNEL = 'community_channel',
  CONVERSATION = 'conversation',
}

export class CallScopeType extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly VALID_VALUES: string[] =
    Object.values(CallScopeTypeEnum);

  constructor(value: CallScopeTypeEnum | string) {
    super(value, CallScopeType.MAX_LENGTH);

    assert(
      CallScopeType.VALID_VALUES.includes(this.value),
      new InvalidCallScopeError(),
    );
  }

  public isConversation(): boolean {
    return this.valueOf() === CallScopeTypeEnum.CONVERSATION;
  }
}
