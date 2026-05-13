import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { MissedCallId } from './value-objects/MissedCallId';

export class MissedCallPayload {
  public static fromPrimitives(primitives: {
    callId: string;
    callerIdentityId: string;
    networkId: string;
    recipientIdentityId: string;
  }): MissedCallPayload {
    return new MissedCallPayload(
      new MissedCallId(primitives.callId),
      new IdentityId(primitives.callerIdentityId),
      new NetworkId(primitives.networkId),
      new IdentityId(primitives.recipientIdentityId),
    );
  }

  constructor(
    private readonly callId: MissedCallId,
    private readonly callerIdentityId: IdentityId,
    private readonly networkId: NetworkId,
    private readonly recipientIdentityId: IdentityId,
  ) {}

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public toPrimitives() {
    return {
      callerIdentityId: this.callerIdentityId.valueOf(),
      callId: this.callId.valueOf(),
      networkId: this.networkId.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
