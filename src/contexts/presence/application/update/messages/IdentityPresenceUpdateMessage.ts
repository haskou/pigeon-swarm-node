import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PresenceStatus } from '../../../domain/value-objects/PresenceStatus';

export class IdentityPresenceUpdateMessage {
  constructor(
    public readonly identityId: string,
    public readonly status?: string,
  ) {}

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getStatus(): PresenceStatus | undefined {
    return this.status ? PresenceStatus.fromPrimitives(this.status) : undefined;
  }
}
