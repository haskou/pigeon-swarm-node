import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { assert, Timestamp } from '@haskou/value-objects';
import canonicalize from 'canonicalize';

import { InvalidNodeBlockListError } from './errors/InvalidNodeBlockListError';
import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlocks } from './NodeBlocks';
import { SignedNodeBlockList } from './SignedNodeBlockList';
import { NodeBlockListVersion } from './value-objects/NodeBlockListVersion';
import { NodePeerId } from './value-objects/NodePeerId';

/**
 * The owner-signed list of identities and nodes this node blocks. Anyone can
 * verify it from `ownerIdentityId` alone: the signature covers its signed
 * form (see `SignedNodeBlockList`), the canonical JSON (RFC 8785) of the
 * document without `identitySignature`. Both arrays are sorted ascending by
 * code unit and unique, so one set of entries has one signed form.
 */
export class NodeBlockList extends NodeBlocks {
  private static readonly TYPE = 'pigeon-node-block-list';

  private readonly blockedIdentityIdValues: Set<string>;

  private static assertSortedAndUnique(values: string[], field: string): void {
    values.forEach((value, index) => {
      assert(
        index === 0 || values[index - 1] < value,
        new InvalidNodeBlockListError(`${field} must be sorted and unique`),
      );
    });
  }

  private static canonicalIdentityId(value: string, field: string): IdentityId {
    const identityId = new IdentityId(value);

    assert(
      identityId.valueOf() === value,
      new InvalidNodeBlockListError(
        `${field} must use the canonical identity id form`,
      ),
    );

    return identityId;
  }

  private static identityIdsFrom(values: string[]): IdentityId[] {
    NodeBlockList.assertSortedAndUnique(values, 'blockedIdentityIds');

    return values.map((value) =>
      NodeBlockList.canonicalIdentityId(value, 'blockedIdentityIds'),
    );
  }

  private static nodePeerIdsFrom(values: string[]): NodePeerId[] {
    NodeBlockList.assertSortedAndUnique(values, 'blockedNodePeerIds');

    return values.map((value) => new NodePeerId(value));
  }

  private static parse(
    content: Buffer,
  ): Omit<NodeBlockListPrimitives, 'identitySignature'> {
    let document: unknown;

    try {
      document = JSON.parse(content.toString('utf8'));
    } catch {
      throw new InvalidNodeBlockListError('document must be JSON');
    }

    assert(
      typeof document === 'object' &&
        document !== null &&
        !Array.isArray(document),
      new InvalidNodeBlockListError('document must be a JSON object'),
    );

    // Every field is validated by fromPrimitives and the canonical form check.
    return document as Omit<NodeBlockListPrimitives, 'identitySignature'>;
  }

  /**
   * Opens bytes whose signature the caller already checked against the
   * pinned identity, and keeps them only in their canonical form, so the
   * list kept is exactly the one that was signed.
   */
  public static fromSigned(signed: SignedNodeBlockList): NodeBlockList {
    const list = NodeBlockList.fromPrimitives({
      ...NodeBlockList.parse(signed.getContent()),
      identitySignature: signed.getIdentitySignature().valueOf(),
    });

    assert(
      list.toSigned().isEqual(signed),
      new InvalidNodeBlockListError('document must be in canonical form'),
    );

    return list;
  }

  public static fromPrimitives(
    primitives: NodeBlockListPrimitives,
  ): NodeBlockList {
    assert(
      primitives.type === NodeBlockList.TYPE,
      new InvalidNodeBlockListError(`type must be "${NodeBlockList.TYPE}"`),
    );

    return new NodeBlockList(
      NodeBlockList.canonicalIdentityId(
        primitives.ownerIdentityId,
        'ownerIdentityId',
      ),
      new NodeBlockListVersion(primitives.version),
      new Timestamp(primitives.issuedAt),
      NodeBlockList.identityIdsFrom(primitives.blockedIdentityIds),
      NodeBlockList.nodePeerIdsFrom(primitives.blockedNodePeerIds),
      new Signature(primitives.identitySignature),
    );
  }

  constructor(
    private readonly ownerIdentityId: IdentityId,
    private readonly version: NodeBlockListVersion,
    private readonly issuedAt: Timestamp,
    private readonly blockedIdentityIds: IdentityId[],
    private readonly blockedNodePeerIds: NodePeerId[],
    private readonly identitySignature: Signature,
  ) {
    super();
    this.blockedIdentityIdValues = new Set(
      blockedIdentityIds.map((identityId) => identityId.valueOf()),
    );
  }

  private unsignedPrimitives(): Omit<
    NodeBlockListPrimitives,
    'identitySignature'
  > {
    return {
      blockedIdentityIds: this.blockedIdentityIds.map((identityId) =>
        identityId.valueOf(),
      ),
      blockedNodePeerIds: this.blockedNodePeerIds.map((peerId) =>
        peerId.valueOf(),
      ),
      issuedAt: this.issuedAt.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      type: NodeBlockList.TYPE,
      version: this.version.valueOf(),
    };
  }

  /**
   * A newer version from the same owner, or any list from a new owner: the
   * storer has already checked that `list` is signed by the current owner, so
   * a previous owner's high version cannot lock the new owner out.
   */
  public acceptsReplacement(list: NodeBlockList): boolean {
    return (
      !list.ownerIdentityId.isEqual(this.ownerIdentityId) ||
      list.version.isNewerThan(this.version)
    );
  }

  public blocksIdentity(identityId: IdentityId): boolean {
    return this.blockedIdentityIdValues.has(identityId.valueOf());
  }

  public getBlockedIdentityIds(): IdentityId[] {
    return [...this.blockedIdentityIds];
  }

  public getBlockedNodePeerIds(): NodePeerId[] {
    return [...this.blockedNodePeerIds];
  }

  public getVersion(): NodeBlockListVersion {
    return this.version;
  }

  public hasValidSignature(): boolean {
    return this.toSigned().isSignedBy(this.ownerIdentityId);
  }

  public isVersion(version: NodeBlockListVersion): boolean {
    return this.version.isEqual(version);
  }

  public getOwnerIdentityId(): IdentityId {
    return this.ownerIdentityId;
  }

  public toPrimitives(): NodeBlockListPrimitives {
    return {
      ...this.unsignedPrimitives(),
      identitySignature: this.identitySignature.valueOf(),
    };
  }

  public toSigned(): SignedNodeBlockList {
    const content = canonicalize(this.unsignedPrimitives());

    assert(
      content !== undefined,
      new InvalidNodeBlockListError('document cannot be canonicalized'),
    );

    return new SignedNodeBlockList(
      Buffer.from(content, 'utf8'),
      this.identitySignature,
    );
  }
}
