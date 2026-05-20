import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollId } from '../../../domain/value-objects/PollId';

export class PollCloseMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly pollId: PollId;
  public readonly recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };

  constructor(
    pollId: string,
    actorIdentityId: string,
    recipients: {
      memberIds?: string[];
      participantIds?: string[];
    },
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.pollId = new PollId(pollId);
    this.recipients = recipients;
  }
}
