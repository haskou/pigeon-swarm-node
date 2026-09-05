import { OrbitDBCommunityDocument } from '@app/contexts/communities/infrastructure/orbitdb/documents/OrbitDBCommunityDocument';
import OrbitDBCommunitySectionMerger from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunitySectionMerger';

describe('OrbitDBCommunitySectionMerger', () => {
  const merger = new OrbitDBCommunitySectionMerger();
  const now = 1_000;

  const baseDocument = (): OrbitDBCommunityDocument => ({
    bannedMemberIds: [],
    createdAt: 100,
    description: 'A community',
    id: 'community-1',
    memberIds: ['identity-1'],
    memberRoles: [],
    name: 'Orbit community',
    networkId: 'network-1',
    ownerIdentityId: 'identity-1',
    roles: [
      {
        builtIn: true,
        id: 'everyone',
        name: 'Everyone',
        permissions: [],
      },
    ],
    textChannels: [
      { createdAt: 100, id: 'channel-1', name: 'general', type: 'text' },
    ],
    visibility: 'public',
    voiceChannels: [],
  });

  const documentWithProfileEdit = (
    document: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument => ({ ...document, name: 'Renamed community' });

  const documentWithAcceptedMember = (
    document: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument => ({
    ...document,
    memberIds: [...document.memberIds, 'identity-2'],
  });

  it('should bump only the revised sections of a local write', () => {
    const previous = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );
    const next = merger.nextDocument(
      documentWithProfileEdit(previous),
      previous,
      previous,
      now + 10,
    );

    expect(next.sectionRevisions).toEqual({
      bans: 1,
      channels: 1,
      members: 1,
      profile: 2,
      roles: 1,
    });
    expect(next.updatedAt).toBe(now + 10);
    expect(next.name).toBe('Renamed community');
  });

  it('should keep the head revision of sections untouched by a local write', () => {
    const previous = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );
    const acceptedMember = merger.nextDocument(
      documentWithAcceptedMember(previous),
      previous,
      previous,
      now + 10,
    );

    const next = merger.nextDocument(
      documentWithProfileEdit(acceptedMember),
      acceptedMember,
      acceptedMember,
      now + 20,
    );

    expect(next.sectionRevisions?.members).toBe(
      acceptedMember.sectionRevisions?.members,
    );
    expect(next.memberIds).toEqual(['identity-1', 'identity-2']);
  });

  it('should keep a concurrent membership change when an unrelated profile edit replicates later', () => {
    const localWrite = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );

    const nodeA = merger.nextDocument(
      documentWithAcceptedMember(localWrite),
      localWrite,
      localWrite,
      now + 10,
    );
    const nodeB = merger.nextDocument(
      documentWithProfileEdit(localWrite),
      localWrite,
      localWrite,
      now + 20,
    );

    const mergedOnA = merger.merge(nodeA, nodeB);
    const mergedOnB = merger.merge(nodeB, nodeA);

    for (const merged of [mergedOnA, mergedOnB]) {
      expect(merged.memberIds).toEqual(['identity-1', 'identity-2']);
      expect(merged.name).toBe('Renamed community');
    }
    expect(mergedOnA).toEqual(mergedOnB);
  });

  it('should preserve sections that changed remotely after the aggregate was loaded', () => {
    const baseline = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );

    // A remote node accepts a member before the local stale write happens.
    const replicatedHead = merger.merge(
      baseline,
      merger.nextDocument(
        documentWithAcceptedMember(baseline),
        baseline,
        baseline,
        now + 10,
      ),
    );

    // The local aggregate still holds the loaded (now stale) member list and
    // renames the community.
    const next = merger.nextDocument(
      documentWithProfileEdit(baseline),
      baseline,
      replicatedHead,
      now + 20,
    );

    expect(next.memberIds).toEqual(['identity-1', 'identity-2']);
    expect(next.sectionRevisions?.members).toBe(
      replicatedHead.sectionRevisions?.members,
    );
    expect(next.name).toBe('Renamed community');
  });

  it('should keep explicit removals instead of reviving them from stale replicas', () => {
    const previous = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );

    const removal = merger.nextDocument(
      { ...previous, memberIds: [] },
      previous,
      previous,
      now + 10,
    );
    const staleSnapshot = {
      ...previous,
      memberIds: ['identity-1'],
      updatedAt: now - 5,
    };

    const merged = merger.merge(removal, staleSnapshot);

    expect(merged.memberIds).toEqual([]);
  });

  it('should let a tombstone dominate concurrently written sections', () => {
    const previous = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );

    const tombstone = merger.tombstone(
      { ...previous, description: 'Deleted' },
      previous,
      now + 30,
    );
    const concurrentEdit = merger.nextDocument(
      documentWithAcceptedMember(previous),
      previous,
      previous,
      now + 40,
    );

    const merged = merger.merge(tombstone, concurrentEdit);

    expect(merged.deleted).toBe(true);
    expect(merged.deletedAt).toBe(now + 30);
  });

  it('should converge regardless of replica arrival order on section revision ties', () => {
    const left = merger.nextDocument(baseDocument(), undefined, undefined, now);
    const right = merger.nextDocument(
      baseDocument(),
      undefined,
      undefined,
      now,
    );

    const renamedLeft = {
      ...left,
      name: 'Alpha',
      updatedAt: now + 5,
    };
    const renamedRight = {
      ...right,
      name: 'Beta',
      updatedAt: now + 5,
    };

    expect(merger.merge(renamedLeft, renamedRight)).toEqual(
      merger.merge(renamedRight, renamedLeft),
    );
  });
});
