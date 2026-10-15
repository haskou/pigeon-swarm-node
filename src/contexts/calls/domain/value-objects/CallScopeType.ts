import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidCallScopeError } from '../errors/InvalidCallScopeError';

export enum CallScopeTypeEnum {
  COMMUNITY_CHANNEL = 'community_channel',
  CONVERSATION = 'conversation',
  GROUP_CAPABILITY = 'group_capability',
}

export class CallScopeType extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly VALID_VALUES: string[] =
    Object.values(CallScopeTypeEnum);

  public static readonly COMMUNITY_CHANNEL = new CallScopeType(
    CallScopeTypeEnum.COMMUNITY_CHANNEL,
  );

  public static readonly CONVERSATION = new CallScopeType(
    CallScopeTypeEnum.CONVERSATION,
  );

  public static readonly GROUP_CAPABILITY = new CallScopeType(
    CallScopeTypeEnum.GROUP_CAPABILITY,
  );

  constructor(value: CallScopeTypeEnum | string) {
    super(value, CallScopeType.MAX_LENGTH);

    assert(
      CallScopeType.VALID_VALUES.includes(this.value),
      new InvalidCallScopeError(),
    );
  }

  public isConversation(): boolean {
    return this.isEqual(CallScopeType.CONVERSATION);
  }

  public isCommunityChannel(): boolean {
    return this.isEqual(CallScopeType.COMMUNITY_CHANNEL);
  }

  public isGroupCapability(): boolean {
    return this.isEqual(CallScopeType.GROUP_CAPABILITY);
  }
}
