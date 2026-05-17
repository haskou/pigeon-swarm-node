import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class IdentityPresenceFindMessage {
  constructor(
    public readonly viewerIdentityId: string,
    public readonly identityIds: string[],
  ) {}

  public getIdentityIds(): IdentityId[] {
    return this.identityIds.map((identityId) => new IdentityId(identityId));
  }

  public getViewerIdentityId(): IdentityId {
    return new IdentityId(this.viewerIdentityId);
  }
}
