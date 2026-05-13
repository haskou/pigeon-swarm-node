import { assert, StringValueObject } from '@haskou/value-objects';

import { InactiveCallError } from '../errors/InactiveCallError';

export enum CallStatusEnum {
  ACTIVE = 'active',
  ENDED = 'ended',
}

export class CallStatus extends StringValueObject {
  private static readonly MAX_LENGTH = 16;
  private static readonly VALID_VALUES: string[] =
    Object.values(CallStatusEnum);

  constructor(value: CallStatusEnum | string) {
    super(value, CallStatus.MAX_LENGTH);

    assert(
      CallStatus.VALID_VALUES.includes(this.value),
      new InactiveCallError(),
    );
  }

  public isActive(): boolean {
    return this.valueOf() === CallStatusEnum.ACTIVE;
  }
}
