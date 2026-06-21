import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';

export class PollVoteRemoveMessage {
  public readonly audience: PollAudience;
  public readonly pollId: PollId;
  public readonly voterIdentityId: IdentityId;

  constructor(pollId: string, voterIdentityId: string, audience: PollAudience) {
    this.audience = audience;
    this.pollId = new PollId(pollId);
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }
}
