import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { NodeBlockEntriesAreNotListedBySourceError } from './errors/NodeBlockEntriesAreNotListedBySourceError';
import { NodeBlockSourceVersionHasChangedError } from './errors/NodeBlockSourceVersionHasChangedError';
import { NodeBlockEntries } from './NodeBlockEntries';
import { NodeBlockList } from './NodeBlockList';
import { NodeBlocks } from './NodeBlocks';
import { NodeBlockSourceFetch } from './NodeBlockSourceFetch';
import { NodeBlockSourcePrimitives } from './NodeBlockSourcePrimitives';
import { NoNodeBlocks } from './NoNodeBlocks';
import { NoNodeBlockSourceFetch } from './NoNodeBlockSourceFetch';
import { RecordedNodeBlockSourceFetch } from './RecordedNodeBlockSourceFetch';
import { NodeBlockListVersion } from './value-objects/NodeBlockListVersion';
import { NodeBlockSourceFetchOutcome } from './value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from './value-objects/NodeBlockSourceOrigin';

/**
 * Another owner's published block list that this node's owner adopted. It is
 * pinned to the publisher's identity: a fetched document replaces the kept one
 * only when that identity signed it and its version is higher, so a hijacked
 * origin, a replayed old version or an unreachable host keeps the last valid
 * list. Entries the publisher adds wait for the owner's approval unless
 * `autoApply` is on; entries it drops stop applying on the next fetch.
 */
export class NodeBlockSource {
  public static adopt(
    ownerIdentityId: IdentityId,
    origin: NodeBlockSourceOrigin,
    autoApply: boolean,
  ): NodeBlockSource {
    return new NodeBlockSource(
      ownerIdentityId,
      origin,
      autoApply,
      new NoNodeBlocks(),
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
    private approved: NodeBlockEntries,
    private lastFetch: NodeBlockSourceFetch,
  ) {}

  private listed(): NodeBlockEntries {
    return NodeBlockEntries.of(this.list);
  }

  private outcomeOf(list: NodeBlockList): NodeBlockSourceFetchOutcome {
    if (!list.getOwnerIdentityId().isEqual(this.ownerIdentityId)) {
      return NodeBlockSourceFetchOutcome.WRONG_SIGNER;
    }

    if (!this.list.acceptsReplacement(list)) {
      return NodeBlockSourceFetchOutcome.NOT_NEWER;
    }

    if (!list.hasValidSignature()) {
      return NodeBlockSourceFetchOutcome.INVALID_SIGNATURE;
    }

    return NodeBlockSourceFetchOutcome.ACCEPTED;
  }

  private assertIsLatestVersion(version: NodeBlockListVersion): void {
    assert(
      this.list.isVersion(version),
      new NodeBlockSourceVersionHasChangedError(),
    );
  }

  /**
   * Changes where the list is fetched from; turning `autoApply` on approves
   * everything pending. A new origin is due on the next refresh, and the old
   * one's diagnostics no longer apply.
   */
  public reconfigure(origin: NodeBlockSourceOrigin, autoApply: boolean): void {
    if (!origin.isEqual(this.origin)) {
      this.lastFetch = new NoNodeBlockSourceFetch();
    }

    this.origin = origin;
    this.autoApply = autoApply;

    if (autoApply) {
      this.approved = this.listed();
    }
  }

  /** Keeps `list` only if the pinned identity signed it with a higher version. */
  public receive(
    list: NodeBlockList,
    at: Timestamp,
  ): NodeBlockSourceFetchOutcome {
    const outcome = this.outcomeOf(list);

    this.lastFetch = new RecordedNodeBlockSourceFetch(at, outcome);

    if (!outcome.isEqual(NodeBlockSourceFetchOutcome.ACCEPTED)) {
      return outcome;
    }

    this.list = list;
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
    };
  }
}
