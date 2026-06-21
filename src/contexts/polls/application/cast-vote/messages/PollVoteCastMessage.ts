import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';
import { PollOptionId } from '../../../domain/value-objects/PollOptionId';

export class PollVoteCastMessage {
  public readonly audience: PollAudience;
  public readonly optionIds: PollOptionId[];
  public readonly pollId: PollId;
  public readonly voterIdentityId: IdentityId;

  constructor(
    pollId: string,
    voterIdentityId: string,
    optionIds: string[],
    audience: PollAudience,
  ) {
    this.audience = audience;
    this.optionIds = optionIds.map((optionId) => new PollOptionId(optionId));
    this.pollId = new PollId(pollId);
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }
}
