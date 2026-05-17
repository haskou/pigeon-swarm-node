import { IdentityPresenceUpdateMessage } from '@app/contexts/presence/application/update/messages/IdentityPresenceUpdateMessage';

import { PutPresenceBody } from '../bodies/PutPresenceBody';

export class PutPresenceRequest {
  constructor(
    private readonly identityId: string,
    private readonly body: PutPresenceBody,
  ) {}

  public getMessage(): IdentityPresenceUpdateMessage {
    return new IdentityPresenceUpdateMessage(
      this.identityId,
      this.body.status,
      this.body.customMessage,
    );
  }
}
