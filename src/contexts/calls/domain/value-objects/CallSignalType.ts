import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidCallScopeError } from '../errors/InvalidCallScopeError';

export enum CallSignalTypeEnum {
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice_candidate',
  OFFER = 'offer',
}

export class CallSignalType extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly VALID_VALUES: string[] =
    Object.values(CallSignalTypeEnum);

  constructor(value: CallSignalTypeEnum | string) {
    super(value, CallSignalType.MAX_LENGTH);

    assert(
      CallSignalType.VALID_VALUES.includes(this.value),
      new InvalidCallScopeError(),
    );
  }
}
