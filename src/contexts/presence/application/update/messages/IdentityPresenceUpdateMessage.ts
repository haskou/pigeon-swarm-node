import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PresenceCustomMessage } from '../../../domain/value-objects/PresenceCustomMessage';
import { PresenceStatus } from '../../../domain/value-objects/PresenceStatus';

export class IdentityPresenceUpdateMessage {
  constructor(
    public readonly identityId: string,
    public readonly status?: string,
    public readonly customMessage?: string,
  ) {}

  public getCustomMessage(): PresenceCustomMessage | undefined {
    return this.customMessage !== undefined
      ? new PresenceCustomMessage(this.customMessage)
      : undefined;
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getStatus(): PresenceStatus | undefined {
    return this.status ? PresenceStatus.fromPrimitives(this.status) : undefined;
  }

  public hasCustomMessage(): boolean {
    return this.customMessage !== undefined;
  }
}
