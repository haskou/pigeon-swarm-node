import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';
import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import canonicalize from 'canonicalize';

export const NODE_PEER_ID_A =
  '12D3KooWAzxzKZYveHXtpG6AsrUJBcWxHBFS2HsEoGTxrMLvKXtf';
export const NODE_PEER_ID_B =
  '12D3KooWBzxzKZYveHXtpG6AsrUJBcWxHBFS2HsEoGTxrMLvKXtf';

const SIGNING_DOMAIN = Buffer.from('pigeon:node-block-list:v1\n', 'utf8');

/** Builds block list documents signed the way an owner's client signs them. */
export class NodeBlockListMother {
  private namedOwner: IdentityId;
  public blockedIdentityIds: string[] = [];
  public blockedNodePeerIds: string[] = [];
  public issuedAt = 1770000000000;
  public version = 1;

  constructor(private readonly owner: KeyPair) {
    this.namedOwner = this.ownerIdentityId();
  }

  public static async identityId(): Promise<IdentityId> {
    return new IdentityId((await KeyPair.generate()).toPrimitives().publicKey);
  }

  public ownerIdentityId(): IdentityId {
    return new IdentityId(this.owner.toPrimitives().publicKey);
  }

  /** Names another owner in the document while still signing with this key. */
  public naming(ownerIdentityId: IdentityId): this {
    this.namedOwner = ownerIdentityId;

    return this;
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

  /** Exactly the bytes a publisher serves: the canonical JSON without the signature. */
  public content(): Buffer {
    return Buffer.from(
      canonicalize({
        blockedIdentityIds: this.blockedIdentityIds,
        blockedNodePeerIds: this.blockedNodePeerIds,
        issuedAt: this.issuedAt,
        ownerIdentityId: this.namedOwner.valueOf(),
        type: 'pigeon-node-block-list',
        version: this.version,
      }) as string,
      'utf8',
    );
  }

  /** Any bytes, signed by the owner the way a publisher signs its list. */
  public signing(content: Buffer | string): SignedNodeBlockList {
    const bytes = Buffer.from(content);

    return new SignedNodeBlockList(
      bytes,
      this.owner.sign(Buffer.concat([SIGNING_DOMAIN, bytes])),
    );
  }

  public signed(): SignedNodeBlockList {
    return this.signing(this.content());
  }

  public primitives(): NodeBlockListPrimitives {
    const content = this.content();

    return {
      ...(JSON.parse(content.toString('utf8')) as Omit<
        NodeBlockListPrimitives,
        'identitySignature'
      >),
      identitySignature: this.signing(content).getIdentitySignature().valueOf(),
    };
  }

  public build(): NodeBlockList {
    return NodeBlockList.fromPrimitives(this.primitives());
  }
}
