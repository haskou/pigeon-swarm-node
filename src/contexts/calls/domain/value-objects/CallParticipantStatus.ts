import { assert, StringValueObject } from '@haskou/value-objects';

import { InactiveCallError } from '../errors/InactiveCallError';

export enum CallParticipantStatusEnum {
  DECLINED = 'declined',
  JOINED = 'joined',
  LEFT = 'left',
  MISSED = 'missed',
  RINGING = 'ringing',
}

export class CallParticipantStatus extends StringValueObject {
  private static readonly MAX_LENGTH = 16;
  private static readonly VALID_VALUES: string[] = Object.values(
    CallParticipantStatusEnum,
  );

  public static readonly DECLINED = new CallParticipantStatus(
    CallParticipantStatusEnum.DECLINED,
  );

  public static readonly JOINED = new CallParticipantStatus(
    CallParticipantStatusEnum.JOINED,
  );

  public static readonly LEFT = new CallParticipantStatus(
    CallParticipantStatusEnum.LEFT,
  );

  public static readonly MISSED = new CallParticipantStatus(
    CallParticipantStatusEnum.MISSED,
  );

  public static readonly RINGING = new CallParticipantStatus(
    CallParticipantStatusEnum.RINGING,
  );

  constructor(value: CallParticipantStatusEnum | string) {
    super(value, CallParticipantStatus.MAX_LENGTH);

    assert(
      CallParticipantStatus.VALID_VALUES.includes(this.value),
      new InactiveCallError(),
    );
  }

  public canReceiveSignal(): boolean {
    return this.isActiveReceiver();
  }

  public isJoined(): boolean {
    return this.isEqual(CallParticipantStatus.JOINED);
  }

  public isActiveReceiver(): boolean {
    return (
      this.isEqual(CallParticipantStatus.JOINED) ||
      this.isEqual(CallParticipantStatus.RINGING)
    );
  }

  public isRinging(): boolean {
    return this.isEqual(CallParticipantStatus.RINGING);
  }
}
