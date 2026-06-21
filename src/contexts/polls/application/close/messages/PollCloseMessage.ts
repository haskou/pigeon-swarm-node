import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';

export class PollCloseMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly audience: PollAudience;
  public readonly pollId: PollId;

  constructor(pollId: string, actorIdentityId: string, audience: PollAudience) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.audience = audience;
    this.pollId = new PollId(pollId);
  }
}
