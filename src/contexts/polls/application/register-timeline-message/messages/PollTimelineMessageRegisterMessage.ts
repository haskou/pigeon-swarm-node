import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

import { Poll } from '../../../domain/Poll';

export class PollTimelineMessageRegisterMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly poll: Poll;
  public readonly signature: Signature;

  constructor(actorIdentityId: string, poll: Poll, signature: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.poll = poll;
    this.signature = new Signature(signature);
  }
}
