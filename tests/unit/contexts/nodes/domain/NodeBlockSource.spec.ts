import { NodeBlockEntriesAreNotListedBySourceError } from '@app/contexts/nodes/domain/errors/NodeBlockEntriesAreNotListedBySourceError';
import { NodeBlockSourceVersionHasChangedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceVersionHasChangedError';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { NodeBlockListVersion } from '@app/contexts/nodes/domain/value-objects/NodeBlockListVersion';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
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

  const list = (
    version: number,
    identityIds: IdentityId[],
  ): SignedNodeBlockList =>
    new NodeBlockListMother(publisher)
      .withVersion(version)
      .blockingIdentities(identityIds)
      .signed();

  const source = (
    autoApply = false,
    floor = new NodeBlockSourceVersionFloor(0),
  ): NodeBlockSource =>
    NodeBlockSource.adopt(
      new IdentityId(publisher.toPrimitives().publicKey),
      origin,
      autoApply,
      floor,
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
        .signed(),
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

  describe('a signed list naming a non-canonical identity id', () => {
    it.each([false, true])(
      'should keep the signed list verbatim yet never pend or apply the alias (autoApply %p)',
      (autoApply) => {
        const alias = IdentityIdMother.aliasPrefix(a);
        const adopted = source(autoApply);

        expect(adopted.receive(list(1, [alias, b]), at)).toEqual(
          NodeBlockSourceFetchOutcome.ACCEPTED,
        );
        adopted.approveAll(new NodeBlockListVersion(1));

        expect(adopted.toPrimitives().list?.blockedIdentityIds).toEqual(
          expect.arrayContaining([alias.valueOf(), b.valueOf()]),
        );
        expect(values(adopted.applied())).toEqual([b.valueOf()]);
        expect(adopted.pending().count()).toBe(0);
      },
    );

    it('should refuse approving the alias', () => {
      const alias = IdentityIdMother.reencoded(a);
      const adopted = source();

      adopted.receive(list(1, [alias]), at);

      expect(() =>
        adopted.approve(
          new NodeBlockListVersion(1),
          new NodeBlockEntries([alias], []),
        ),
      ).toThrow(NodeBlockEntriesAreNotListedBySourceError);
      expect(adopted.applied().count()).toBe(0);
    });
  });

  describe('dropNonCanonicalApprovals', () => {
    it('should drop stored approvals of non-canonical identity ids and count them', () => {
      const alias = IdentityIdMother.aliasPrefix(a);
      const adopted = source();

      adopted.receive(list(1, [alias, a, b]), at);
      const stored = NodeBlockSource.fromPrimitives({
        ...adopted.toPrimitives(),
        approved: {
          identityIds: [alias.valueOf(), a.valueOf()],
          nodePeerIds: [NODE_PEER_ID_A],
        },
      });

      expect(stored.dropNonCanonicalApprovals()).toBe(1);
      expect(stored.applied().toPrimitives()).toEqual({
        identityIds: [a.valueOf()],
        nodePeerIds: [NODE_PEER_ID_A],
      });
      expect(values(stored.pending())).toEqual([b.valueOf()]);
    });

    it('should leave canonical approvals unchanged', () => {
      const adopted = source();

      adopted.receive(list(1, [a, b]), at);
      adopted.approveAll(new NodeBlockListVersion(1));
      const before = adopted.toPrimitives();

      expect(adopted.dropNonCanonicalApprovals()).toBe(0);
      expect(adopted.toPrimitives()).toEqual(before);
    });
  });

  it('should ask again for an entry that was removed and added back', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);
    adopted.approveAll(new NodeBlockListVersion(1));
    adopted.receive(list(2, []), at);
    adopted.receive(list(3, [a]), at);

    expect(adopted.applied().count()).toBe(0);
    expect(values(adopted.pending())).toEqual([a.valueOf()]);
  });

  it('should keep pending entries pending when autoApply is turned on', () => {
    const adopted = source();

    adopted.receive(list(1, [a]), at);
    adopted.reconfigure(origin, true);

    expect(adopted.applied().count()).toBe(0);
    expect(values(adopted.pending())).toEqual([a.valueOf()]);
  });

  it('should refuse a version at or below the floor it was adopted with', () => {
    const adopted = source(true, new NodeBlockSourceVersionFloor(2));

    expect(adopted.receive(list(2, [a]), at)).toEqual(
      NodeBlockSourceFetchOutcome.NOT_NEWER,
    );
    expect(adopted.receive(list(3, [a]), at)).toEqual(
      NodeBlockSourceFetchOutcome.ACCEPTED,
    );
    expect(adopted.toPrimitives().versionFloor).toBe(3);
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

  it('should keep the last valid list when another key signed', async () => {
    const adopted = source(true);
    const impostor = new NodeBlockListMother(await KeyPair.generate())
      .withVersion(9)
      .blockingIdentities([b])
      .signed();

    adopted.receive(list(1, [a]), at);

    expect(adopted.receive(impostor, at)).toEqual(
      NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
    );
    expect(values(adopted.applied())).toEqual([a.valueOf()]);
  });

  it('should keep the last valid list when the signature does not verify', () => {
    const adopted = source(true);
    const forged = new SignedNodeBlockList(
      new NodeBlockListMother(publisher)
        .blockingIdentities([a])
        .withVersion(5)
        .content(),
      list(1, [a]).getIdentitySignature(),
    );

    adopted.receive(list(1, [a]), at);

    expect(adopted.receive(forged, at)).toEqual(
      NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
    );
    expect(adopted.toPrimitives().list?.version).toBe(1);
  });

  it('should refuse a list the pinned key signed naming another owner', async () => {
    const adopted = source(true);
    const renamed = new NodeBlockListMother(publisher)
      .naming(await NodeBlockListMother.identityId())
      .withVersion(2)
      .signed();

    expect(adopted.receive(renamed, at)).toEqual(
      NodeBlockSourceFetchOutcome.WRONG_SIGNER,
    );
    expect(adopted.toPrimitives().list).toBeNull();
  });

  describe('before parsing the served bytes', () => {
    it('should refuse bytes another key signed even when they are not JSON', async () => {
      const impostor = new NodeBlockListMother(
        await KeyPair.generate(),
      ).signing('not json');

      expect(source().receive(impostor, at)).toEqual(
        NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
      );
    });

    it('should refuse unsigned bytes even when they hold a valid list', () => {
      const content = new NodeBlockListMother(publisher)
        .withVersion(2)
        .content();

      expect(
        source().receive(
          new SignedNodeBlockList(
            content,
            list(1, []).getIdentitySignature(),
          ),
          at,
        ),
      ).toEqual(NodeBlockSourceFetchOutcome.INVALID_SIGNATURE);
    });
  });

  it.each([
    ['entries that are not identity ids', false],
    ['a form that is not canonical', true],
  ])(
    'should refuse a document the publisher signed with %s',
    (_, pretty) => {
      const adopted = source(true);
      const mother = new NodeBlockListMother(publisher);

      if (!pretty) {
        mother.blockedIdentityIds = ['not-an-identity-id'];
      }

      const content = pretty
        ? JSON.stringify(
            JSON.parse(mother.content().toString('utf8')),
            undefined,
            2,
          )
        : mother.content();

      expect(adopted.receive(mother.signing(content), at)).toEqual(
        NodeBlockSourceFetchOutcome.INVALID_DOCUMENT,
      );
      expect(adopted.toPrimitives().list).toBeNull();
      expect(adopted.toPrimitives().versionFloor).toBe(0);
    },
  );

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
