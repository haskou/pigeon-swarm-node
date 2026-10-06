import { ContentReplicationRegisterMessage } from '@app/contexts/content-replication/application/register-content/messages/ContentReplicationRegisterMessage';

import { PutContentReplicationBody } from '../bodies/PutContentReplicationBody';

export class PutContentReplicationRequest {
  constructor(
    private readonly identityId: string,
    private readonly cid: string,
    private readonly body: PutContentReplicationBody,
  ) {}

  public getMessage(): ContentReplicationRegisterMessage {
    return new ContentReplicationRegisterMessage(
      this.identityId,
      this.cid,
      this.body.networkId,
      this.body.context,
      this.body.sizeBytes,
      this.body.mutation,
    );
  }
}
