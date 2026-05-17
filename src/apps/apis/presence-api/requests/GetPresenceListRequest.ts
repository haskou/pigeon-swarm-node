import { IdentityPresenceFindMessage } from '@app/contexts/presence/application/find/messages/IdentityPresenceFindMessage';

export class GetPresenceListRequest {
  constructor(
    private readonly viewerIdentityId: string,
    private readonly identityIds?: string,
  ) {}

  private getIdentityIds(): string[] {
    return (this.identityIds || '')
      .split(',')
      .map((identityId) => identityId.trim())
      .filter((identityId) => identityId.length > 0);
  }

  public getMessage(): IdentityPresenceFindMessage {
    return new IdentityPresenceFindMessage(
      this.viewerIdentityId,
      this.getIdentityIds(),
    );
  }
}
