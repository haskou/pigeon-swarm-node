import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollId } from '../../../domain/value-objects/PollId';
import { PollOptionId } from '../../../domain/value-objects/PollOptionId';

export class PollVoteCastMessage {
  public readonly optionIds: PollOptionId[];
  public readonly pollId: PollId;
  public readonly recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };

  public readonly voterIdentityId: IdentityId;

  constructor(
    pollId: string,
    voterIdentityId: string,
    optionIds: string[],
    recipients: {
      memberIds?: string[];
      participantIds?: string[];
    },
  ) {
    this.optionIds = optionIds.map((optionId) => new PollOptionId(optionId));
    this.pollId = new PollId(pollId);
    this.recipients = recipients;
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }
}
