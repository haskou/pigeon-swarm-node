import { IdentityPresenceFindMessage } from '@app/contexts/presence/application/find/messages/IdentityPresenceFindMessage';

export class GetPresenceRequest {
  constructor(
    private readonly viewerIdentityId: string,
    private readonly identityId: string,
  ) {}

  public getMessage(): IdentityPresenceFindMessage {
    return new IdentityPresenceFindMessage(this.viewerIdentityId, [
      this.identityId,
    ]);
  }
}
