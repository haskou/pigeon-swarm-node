import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert } from '@haskou/value-objects';

import { InvalidNodeCommunityStateAnnouncementError } from '../../../domain/errors/InvalidNodeCommunityStateAnnouncementError';
import { NodeCommunityStateDigest } from '../../../domain/value-objects/NodeCommunityStateDigest';

/** libp2p peer ids are well below this; the bound only caps hostile input. */
const MAX_PEER_ID_LENGTH = 128;

export class NodePeerCommunityStateRecordMessage {
  public readonly digest: NodeCommunityStateDigest;
  public readonly networkId: NetworkId;

  constructor(
    networkId: string,
    public readonly peerId: string,
    digest: string,
  ) {
    assert(
      peerId.length > 0 && peerId.length <= MAX_PEER_ID_LENGTH,
      new InvalidNodeCommunityStateAnnouncementError(),
    );
    this.networkId = new NetworkId(networkId);
    this.digest = new NodeCommunityStateDigest(digest);
  }
}
