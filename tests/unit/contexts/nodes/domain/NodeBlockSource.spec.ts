import { NodeBlockEntriesAreNotListedBySourceError } from '@app/contexts/nodes/domain/errors/NodeBlockEntriesAreNotListedBySourceError';
import { NodeBlockSourceVersionHasChangedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceVersionHasChangedError';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NodeBlockListVersion } from '@app/contexts/nodes/domain/value-objects/NodeBlockListVersion';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
  NodeBlockListMother,
} from '../../../mothers/NodeBlockListMother';

describe('NodeBlockSource', () => {
  const at = new Timestamp(1770000000000);
  const origin = new NodeBlockSourceOrigin('https://publisher.example');
  let publisher: KeyPair;
  let a: IdentityId;
  let b: IdentityId;

  const list = (version: number, identityIds: IdentityId[]): NodeBlockList =>
    new NodeBlockListMother(publisher)
      .withVersion(version)
      .blockingIdentities(identityIds)
      .build();

  const source = (autoApply = false): NodeBlockSource =>
    NodeBlockSource.adopt(
      new IdentityId(publisher.toPrimitives().publicKey),
      origin,
      autoApply,
    );

  const values = (entries: NodeBlockEntries): string[] =>
    entries.toPrimitives().identityIds;

  beforeAll(async () => {
    publisher = await KeyPair.generate();
    a = await NodeBlockListMother.identityId();
    b = await NodeBlockListMother.identityId();
  });

  it('should keep added entries pending until the owner approves them', () => {
    const adopted = source();

    expect(adopted.receive(list(1, [a]), at)).toEqual(
      NodeBlockSourceFetchOutcome.ACCEPTED,
    );
    expect(adopted.applied().count()).toBe(0);
    expect(values(adopted.pending())).toEqual([a.valueOf()]);

    adopted.approveAll(new NodeBlockListVersion(1));

    expect(values(adopted.applied())).toEqual([a.valueOf()]);
    expect(adopted.pending().count()).toBe(0);
  });

  it('should approve chosen entries only', () => {
    const adopted = source();

    adopted.receive(
      new NodeBlockListMother(publisher)
        .blockingIdentities([a, b])
        .blockingNodePeers([NODE_PEER_ID_A])
        .build(),
      at,
    );
    adopted.approve(
      new NodeBlockListVersion(1),
      new NodeBlockEntries([b], [new NodePeerId(NODE_PEER_ID_A)]),
    );

    expect(adopted.applied().toPrimitives()).toEqual({
      identityIds: [b.valueOf()],
      nodePeerIds: [NODE_PEER_ID_A],
    });
    expect(values(adopted.pending())).toEqual([a.valueOf()]);
  });

  it('should refuse approving entries the source does not list', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);

    expect(() =>
      adopted.approve(
        new NodeBlockListVersion(1),
        new NodeBlockEntries([], [new NodePeerId(NODE_PEER_ID_B)]),
      ),
    ).toThrow(NodeBlockEntriesAreNotListedBySourceError);
    expect(adopted.applied().count()).toBe(0);
  });

  it('should refuse approving a version that is no longer the latest', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);
    adopted.receive(list(2, [a, b]), at);

    expect(() => adopted.approveAll(new NodeBlockListVersion(1))).toThrow(
      NodeBlockSourceVersionHasChangedError,
    );
    expect(() =>
      adopted.approve(
        new NodeBlockListVersion(1),
        new NodeBlockEntries([a], []),
      ),
    ).toThrow(NodeBlockSourceVersionHasChangedError);
    expect(adopted.applied().count()).toBe(0);
  });

  it('should refuse approving before any list was kept', () => {
    expect(() => source().approveAll(new NodeBlockListVersion(1))).toThrow(
      NodeBlockSourceVersionHasChangedError,
    );
  });

  it('should apply added entries on fetch with autoApply', () => {
    const adopted = source(true);

    adopted.receive(list(1, [a]), at);
    adopted.receive(list(2, [a, b]), at);

    expect(values(adopted.applied())).toEqual(
      [a.valueOf(), b.valueOf()].sort(),
    );
    expect(adopted.pending().count()).toBe(0);
  });

  it.each([false, true])(
    'should apply removals on fetch (autoApply %p)',
    (autoApply) => {
      const adopted = source(autoApply);

      adopted.receive(list(1, [a, b]), at);
      adopted.approveAll(new NodeBlockListVersion(1));
      adopted.receive(list(2, [b]), at);

      expect(values(adopted.applied())).toEqual([b.valueOf()]);
    },
  );

  it('should ask again for an entry that was removed and added back', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);
    adopted.approveAll(new NodeBlockListVersion(1));
    adopted.receive(list(2, []), at);
    adopted.receive(list(3, [a]), at);

    expect(adopted.applied().count()).toBe(0);
    expect(values(adopted.pending())).toEqual([a.valueOf()]);
  });

  it('should approve everything pending when autoApply is turned on', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);
    adopted.reconfigure(origin, true);

    expect(values(adopted.applied())).toEqual([a.valueOf()]);
  });

  it('should keep the last valid list when a version is not newer', () => {
    const adopted = source(true);

    adopted.receive(list(2, [a]), at);

    expect(adopted.receive(list(2, [b]), at)).toEqual(
      NodeBlockSourceFetchOutcome.NOT_NEWER,
    );
    expect(adopted.receive(list(1, [b]), at)).toEqual(
      NodeBlockSourceFetchOutcome.NOT_NEWER,
    );
    expect(values(adopted.applied())).toEqual([a.valueOf()]);
    expect(adopted.toPrimitives().list?.version).toBe(2);
  });

  it('should keep the last valid list when another identity signed', async () => {
    const adopted = source(true);
    const impostor = new NodeBlockListMother(await KeyPair.generate())
      .withVersion(9)
      .blockingIdentities([b])
      .build();

    adopted.receive(list(1, [a]), at);

    expect(adopted.receive(impostor, at)).toEqual(
      NodeBlockSourceFetchOutcome.WRONG_SIGNER,
    );
    expect(values(adopted.applied())).toEqual([a.valueOf()]);
  });

  it('should keep the last valid list when the signature does not verify', () => {
    const adopted = source(true);
    const forged = NodeBlockList.fromPrimitives({
      ...new NodeBlockListMother(publisher)
        .blockingIdentities([a])
        .primitives(),
      version: 5,
    });

    adopted.receive(list(1, [a]), at);

    expect(adopted.receive(forged, at)).toEqual(
      NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
    );
    expect(adopted.toPrimitives().list?.version).toBe(1);
  });

  it('should record fetch diagnostics without changing the list', () => {
    const adopted = source(true);
    const later = new Timestamp(1770000060000);

    adopted.receive(list(1, [a]), at);
    adopted.fetchFailed(NodeBlockSourceFetchOutcome.TOO_LARGE, later);

    expect(adopted.toPrimitives().lastFetch).toEqual({
      at: later.valueOf(),
      outcome: 'too-large',
    });
    expect(values(adopted.applied())).toEqual([a.valueOf()]);
    expect(adopted.wasFetchedBefore(new Timestamp(1770000060001))).toBe(true);
    expect(adopted.wasFetchedBefore(later)).toBe(false);
  });

  it('should be due before its first fetch', () => {
    expect(source().wasFetchedBefore(at)).toBe(true);
  });

  it('should be due again and keep its list when its origin changes', () => {
    const adopted = source(true);

    adopted.receive(list(1, [a]), at);
    adopted.reconfigure(
      new NodeBlockSourceOrigin('https://moved.example'),
      true,
    );

    expect(adopted.wasFetchedBefore(at)).toBe(true);
    expect(adopted.toPrimitives().lastFetch).toBeNull();
    expect(values(adopted.applied())).toEqual([a.valueOf()]);
  });

  it('should round-trip primitives', () => {
    const adopted = source();

    adopted.receive(list(1, [a, b]), at);
    adopted.approve(new NodeBlockListVersion(1), new NodeBlockEntries([a], []));

    expect(
      NodeBlockSource.fromPrimitives(adopted.toPrimitives()).toPrimitives(),
    ).toEqual(adopted.toPrimitives());
  });
});
