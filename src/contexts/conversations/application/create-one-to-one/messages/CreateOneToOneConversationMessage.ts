import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CreateOneToOneConversationMessage {
  public readonly firstParticipantIdentityId: IdentityId;
  public readonly secondParticipantIdentityId: IdentityId;

  constructor(
    firstParticipantIdentityId: string,
    secondParticipantIdentityId: string,
  ) {
    this.firstParticipantIdentityId = new IdentityId(
      firstParticipantIdentityId,
    );
    this.secondParticipantIdentityId = new IdentityId(
      secondParticipantIdentityId,
    );
  }
}
