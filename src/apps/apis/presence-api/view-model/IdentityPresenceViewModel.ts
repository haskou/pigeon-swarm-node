import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class IdentityPresenceViewModel {
  constructor(
    private readonly presence: IdentityPresence,
    private readonly viewerIdentityId: IdentityId,
  ) {}

  public toResource(): object {
    return this.presence.visiblePrimitivesFor(this.viewerIdentityId);
  }
}
