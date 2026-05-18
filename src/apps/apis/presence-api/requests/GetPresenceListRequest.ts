import { IdentityPresenceFindMessage } from '@app/contexts/presence/application/find/messages/IdentityPresenceFindMessage';

export class GetPresenceListRequest {
  constructor(
    private readonly viewerIdentityId: string,
    private readonly identityIds?: string | string[],
  ) {}

  private rawIdentityIds(): string[] {
    if (!this.identityIds) {
      return [];
    }

    return Array.isArray(this.identityIds)
      ? this.identityIds
      : [this.identityIds];
  }

  private getIdentityIds(): string[] {
    return this.rawIdentityIds()
      .flatMap((identityIds) => identityIds.split(','))
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
