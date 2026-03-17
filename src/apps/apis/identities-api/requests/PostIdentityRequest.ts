import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';

import { PostIdentityBody } from '../bodies/PostIdentityBody';

export class PostIdentityRequest {
  constructor(private readonly body: PostIdentityBody) {}

  public getIdentityCreateMessage(): IdentityCreateMessage {
    return new IdentityCreateMessage(this.body.name, this.body.password);
  }
}
