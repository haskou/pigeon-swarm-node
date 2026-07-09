import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { PresenceStatus } from '@app/contexts/presence/domain/value-objects/PresenceStatus';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class IdentityPresenceViewModel {
  constructor(
    private readonly presence: IdentityPresence,
    private readonly viewerIdentityId: IdentityId,
  ) {}

  public toResource(): object {
    const primitives = this.presence.toPrimitives();
    const resource = {
      ...(primitives.customMessage
        ? { customMessage: primitives.customMessage }
        : {}),
      identityId: primitives.identityId,
      ...(primitives.lastActivityAt
        ? { lastActivityAt: primitives.lastActivityAt }
        : {}),
      ...(primitives.lastHeartbeatAt
        ? { lastHeartbeatAt: primitives.lastHeartbeatAt }
        : {}),
      status: primitives.status,
      updatedAt: primitives.updatedAt,
    };

    if (this.presence.isVisibleTo(this.viewerIdentityId)) {
      return resource;
    }

    return {
      identityId: resource.identityId,
      status: PresenceStatus.DISCONNECTED.valueOf(),
      updatedAt: resource.updatedAt,
    };
  }
}
