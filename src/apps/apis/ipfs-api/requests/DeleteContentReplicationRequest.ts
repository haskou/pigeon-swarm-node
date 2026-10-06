import { ContentReplicationUnregisterMessage } from '@app/contexts/content-replication/application/unregister-content/messages/ContentReplicationUnregisterMessage';

import { DeleteContentReplicationBody } from '../bodies/DeleteContentReplicationBody';

export class DeleteContentReplicationRequest {
  constructor(
    private readonly identityId: string,
    private readonly cid: string,
    private readonly body: DeleteContentReplicationBody,
  ) {}

  public getMessage(): ContentReplicationUnregisterMessage {
    return new ContentReplicationUnregisterMessage(
      this.identityId,
      this.cid,
      this.body.networkId,
      this.body.mutation,
    );
  }
}
