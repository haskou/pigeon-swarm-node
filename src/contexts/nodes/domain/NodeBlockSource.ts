import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { NodeBlockEntriesAreNotListedBySourceError } from './errors/NodeBlockEntriesAreNotListedBySourceError';
import { NodeBlockSourceVersionHasChangedError } from './errors/NodeBlockSourceVersionHasChangedError';
import { NodeBlockEntries } from './NodeBlockEntries';
import { NodeBlockList } from './NodeBlockList';
import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlocks } from './NodeBlocks';
import { NodeBlockSourceFetch } from './NodeBlockSourceFetch';
import { NodeBlockSourcePrimitives } from './NodeBlockSourcePrimitives';
import { NoNodeBlocks } from './NoNodeBlocks';
import { NoNodeBlockSourceFetch } from './NoNodeBlockSourceFetch';
import { RecordedNodeBlockSourceFetch } from './RecordedNodeBlockSourceFetch';
import { NodeBlockListVersion } from './value-objects/NodeBlockListVersion';
import { NodeBlockSourceFetchOutcome } from './value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from './value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from './value-objects/NodeBlockSourceVersionFloor';

/**
 * Another owner's published block list that this node's owner adopted. It is
 * pinned to the publisher's identity: a fetched document replaces the kept one
 * only when that identity signed it and its version is above the highest one
 * ever accepted from it, even before the source was last removed, so a
 * hijacked origin, a replayed old version or an unreachable host keeps the
 * last valid list. The signer, version and signature are checked before any
 * entry is validated. Entries the publisher adds wait for the owner's approval
 * unless `autoApply` was on when the list arrived; entries it drops stop
 * applying on the next fetch.
 */
export class NodeBlockSource {
  private static validated(
    document: NodeBlockListPrimitives,
  ): NodeBlockList | undefined {
    try {
      return NodeBlockList.fromPrimitives(document);
    } catch {
      return undefined;
    }
  }

  public static adopt(
    ownerIdentityId: IdentityId,
    origin: NodeBlockSourceOrigin,
    autoApply: boolean,
    floor: NodeBlockSourceVersionFloor,
  ): NodeBlockSource {
    return new NodeBlockSource(
      ownerIdentityId,
      origin,
      autoApply,
      new NoNodeBlocks(),
      floor,
      NodeBlockEntries.none(),
      new NoNodeBlockSourceFetch(),
    );
  }

  public static fromPrimitives(
    primitives: NodeBlockSourcePrimitives,
  ): NodeBlockSource {
    return new NodeBlockSource(
      new IdentityId(primitives.ownerIdentityId),
      new NodeBlockSourceOrigin(primitives.origin),
      primitives.autoApply,
      primitives.list
        ? NodeBlockList.fromPrimitives(primitives.list)
        : new NoNodeBlocks(),
      new NodeBlockSourceVersionFloor(primitives.versionFloor),
      NodeBlockEntries.fromPrimitives(primitives.approved),
      primitives.lastFetch
        ? RecordedNodeBlockSourceFetch.fromPrimitives(primitives.lastFetch)
        : new NoNodeBlockSourceFetch(),
    );
  }

  constructor(
    private readonly ownerIdentityId: IdentityId,
    private origin: NodeBlockSourceOrigin,
    private autoApply: boolean,
    private list: NodeBlocks,
    private floor: NodeBlockSourceVersionFloor,
    private approved: NodeBlockEntries,
    private lastFetch: NodeBlockSourceFetch,
  ) {}

  private listed(): NodeBlockEntries {
    return NodeBlockEntries.of(this.list);
  }

  /** Signer, version and signature first, so an unsigned document's entries are never validated. */
  private refusalOf(
    document: NodeBlockListPrimitives,
  ): NodeBlockSourceFetchOutcome | undefined {
    if (document.ownerIdentityId !== this.ownerIdentityId.valueOf()) {
      return NodeBlockSourceFetchOutcome.WRONG_SIGNER;
    }

    if (!this.floor.admits(document.version)) {
      return NodeBlockSourceFetchOutcome.NOT_NEWER;
    }

    if (!NodeBlockList.isSignedBy(document, this.ownerIdentityId)) {
      return NodeBlockSourceFetchOutcome.INVALID_SIGNATURE;
    }

    return undefined;
  }

  private assertIsLatestVersion(version: NodeBlockListVersion): void {
    assert(
      this.list.isVersion(version),
      new NodeBlockSourceVersionHasChangedError(),
    );
  }

  /**
   * Changes where the list is fetched from and whether later lists apply on
   * their own. Turning `autoApply` on approves nothing already pending: the
   * owner approves those naming the version they reviewed. A new origin is due
   * on the next refresh, and the old one's diagnostics no longer apply.
   */
  public reconfigure(origin: NodeBlockSourceOrigin, autoApply: boolean): void {
    if (!origin.isEqual(this.origin)) {
      this.lastFetch = new NoNodeBlockSourceFetch();
    }

    this.origin = origin;
    this.autoApply = autoApply;
  }

  /** Keeps `document` only if the pinned identity signed it with a version above the floor. */
  public receive(
    document: NodeBlockListPrimitives,
    at: Timestamp,
  ): NodeBlockSourceFetchOutcome {
    const refusal = this.refusalOf(document);
    const list = refusal ? undefined : NodeBlockSource.validated(document);
    const outcome =
      refusal ??
      (list
        ? NodeBlockSourceFetchOutcome.ACCEPTED
        : NodeBlockSourceFetchOutcome.INVALID_DOCUMENT);

    this.lastFetch = new RecordedNodeBlockSourceFetch(at, outcome);

    if (!list) {
      return outcome;
    }

    this.list = list;
    this.floor = new NodeBlockSourceVersionFloor(document.version);
    this.approved = this.autoApply
      ? this.listed()
      : this.approved.intersection(this.listed());

    return outcome;
  }

  /** Records a failed fetch; the kept list stays as it was. */
  public fetchFailed(
    outcome: NodeBlockSourceFetchOutcome,
    at: Timestamp,
  ): void {
    this.lastFetch = new RecordedNodeBlockSourceFetch(at, outcome);
  }

  /** Approves every pending entry of `version`, which must still be the latest one. */
  public approveAll(version: NodeBlockListVersion): void {
    this.assertIsLatestVersion(version);

    this.approved = this.listed();
  }

  /** Approves chosen entries of `version`, which must still be the latest one and list them. */
  public approve(
    version: NodeBlockListVersion,
    entries: NodeBlockEntries,
  ): void {
    this.assertIsLatestVersion(version);
    assert(
      this.listed().includes(entries),
      new NodeBlockEntriesAreNotListedBySourceError(),
    );

    this.approved = this.approved.union(entries);
  }

  /** Entries of the kept list that wait for the owner's review. */
  public pending(): NodeBlockEntries {
    return this.listed().without(this.approved);
  }

  /** Entries this source currently makes the node block. */
  public applied(): NodeBlockEntries {
    return this.approved;
  }

  public wasFetchedBefore(threshold: Timestamp): boolean {
    return this.lastFetch.wasBefore(threshold);
  }

  public getOwnerIdentityId(): IdentityId {
    return this.ownerIdentityId;
  }

  public getVersionFloor(): NodeBlockSourceVersionFloor {
    return this.floor;
  }

  public getOrigin(): NodeBlockSourceOrigin {
    return this.origin;
  }

  public toPrimitives(): NodeBlockSourcePrimitives {
    return {
      approved: this.approved.toPrimitives(),
      autoApply: this.autoApply,
      lastFetch: this.lastFetch.toPrimitives(),
      list: this.list.toPrimitives() ?? null,
      origin: this.origin.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      versionFloor: this.floor.valueOf(),
    };
  }
}
