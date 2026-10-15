import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { assert, Timestamp } from '@haskou/value-objects';
import canonicalize from 'canonicalize';

import { InvalidNodeBlockListError } from './errors/InvalidNodeBlockListError';
import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlocks } from './NodeBlocks';
import { NodeBlockListVersion } from './value-objects/NodeBlockListVersion';
import { NodePeerId } from './value-objects/NodePeerId';

/**
 * The owner-signed list of identities and nodes this node blocks. Anyone can
 * verify it from `ownerIdentityId` alone: the signature covers
 * `"pigeon:node-block-list:v1\n"` followed by the canonical JSON (RFC 8785) of
 * the document without `identitySignature`. Both arrays are sorted ascending
 * by code unit and unique, so one set of entries has one signed form.
 */
export class NodeBlockList extends NodeBlocks {
  private static readonly TYPE = 'pigeon-node-block-list';
  private static readonly SIGNING_DOMAIN = 'pigeon:node-block-list:v1\n';

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

  private signedContent(): string {
    const canonical = canonicalize({
      ...this.toPrimitives(),
      identitySignature: undefined,
    });

    assert(
      canonical !== undefined,
      new InvalidNodeBlockListError('document cannot be canonicalized'),
    );

    return `${NodeBlockList.SIGNING_DOMAIN}${canonical}`;
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

  public hasValidSignature(): boolean {
    return this.ownerIdentityId.isValidSignature(
      this.signedContent(),
      this.identitySignature,
    );
  }

  public isVersion(version: NodeBlockListVersion): boolean {
    return this.version.isEqual(version);
  }

  public getOwnerIdentityId(): IdentityId {
    return this.ownerIdentityId;
  }

  public toPrimitives(): NodeBlockListPrimitives {
    return {
      blockedIdentityIds: this.blockedIdentityIds.map((identityId) =>
        identityId.valueOf(),
      ),
      blockedNodePeerIds: this.blockedNodePeerIds.map((peerId) =>
        peerId.valueOf(),
      ),
      identitySignature: this.identitySignature.valueOf(),
      issuedAt: this.issuedAt.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      type: NodeBlockList.TYPE,
      version: this.version.valueOf(),
    };
  }
}
