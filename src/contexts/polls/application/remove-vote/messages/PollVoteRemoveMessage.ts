import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollId } from '../../../domain/value-objects/PollId';

export class PollVoteRemoveMessage {
  public readonly pollId: PollId;
  public readonly recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };

  public readonly voterIdentityId: IdentityId;

  constructor(
    pollId: string,
    voterIdentityId: string,
    recipients: {
      memberIds?: string[];
      participantIds?: string[];
    },
  ) {
    this.pollId = new PollId(pollId);
    this.recipients = recipients;
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }
}
