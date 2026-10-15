import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import canonicalize from 'canonicalize';

export const NODE_PEER_ID_A =
  '12D3KooWAzxzKZYveHXtpG6AsrUJBcWxHBFS2HsEoGTxrMLvKXtf';
export const NODE_PEER_ID_B =
  '12D3KooWBzxzKZYveHXtpG6AsrUJBcWxHBFS2HsEoGTxrMLvKXtf';

/** Builds block list documents signed the way an owner's client signs them. */
export class NodeBlockListMother {
  public blockedIdentityIds: string[] = [];
  public blockedNodePeerIds: string[] = [];
  public issuedAt = 1770000000000;
  public version = 1;

  constructor(private readonly owner: KeyPair) {}

  public static async identityId(): Promise<IdentityId> {
    return new IdentityId((await KeyPair.generate()).toPrimitives().publicKey);
  }

  public ownerIdentityId(): IdentityId {
    return new IdentityId(this.owner.toPrimitives().publicKey);
  }

  public withVersion(version: number): this {
    this.version = version;

    return this;
  }

  public blockingIdentities(identityIds: IdentityId[]): this {
    this.blockedIdentityIds = identityIds
      .map((identityId) => identityId.valueOf())
      .sort();

    return this;
  }

  public blockingNodePeers(peerIds: string[]): this {
    this.blockedNodePeerIds = [...peerIds].sort();

    return this;
  }

  public primitives(): NodeBlockListPrimitives {
    const unsigned = {
      blockedIdentityIds: this.blockedIdentityIds,
      blockedNodePeerIds: this.blockedNodePeerIds,
      issuedAt: this.issuedAt,
      ownerIdentityId: this.ownerIdentityId().valueOf(),
      type: 'pigeon-node-block-list',
      version: this.version,
    };

    return {
      ...unsigned,
      identitySignature: this.owner
        .sign(`pigeon:node-block-list:v1\n${canonicalize(unsigned)}`)
        .valueOf(),
    };
  }

  public build(): NodeBlockList {
    return NodeBlockList.fromPrimitives(this.primitives());
  }
}
