import { OrbitDBCommunityDocument } from '../../../../../../src/contexts/communities/infrastructure/orbitdb/documents/OrbitDBCommunityDocument';
import OrbitDBCommunityReplicaMerger from '../../../../../../src/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityReplicaMerger';

const fixture = (): OrbitDBCommunityDocument => ({
  id: 'community',
  networkId: 'private-network',
  ownerIdentityId: 'owner',
  createdAt: 1,
  name: 'Original',
  description: 'Original description',
  visibility: 'private',
  autoJoinEnabled: false,
  discoverable: false,
  memberIds: ['owner', 'member'],
  bannedMemberIds: [],
  memberRoles: [],
  roles: ['everyone', 'alpha', 'beta', 'shared'].map((id) => ({
    id,
    name: id,
    builtIn: id === 'everyone',
    permissions: [] as string[],
  })),
  textChannels: [{ id: 'text', name: 'General', type: 'text', createdAt: 1 }],
  voiceChannels: [{ id: 'voice', name: 'Voice', type: 'voice', createdAt: 1 }],
});

const permutations = <T>(values: T[]): T[][] =>
  values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
        permutations(values.filter((_, i) => i !== index)).map((rest) => [
          value,
          ...rest,
        ]),
      );

const roleIdsFor = (
  document: OrbitDBCommunityDocument,
  identityId: string,
): string[] =>
  document.memberRoles?.find(
    (assignment) => assignment.identityId === identityId,
  )?.roleIds ?? [];

describe('OrbitDBCommunityReplicaMerger', () => {
  const merger = new OrbitDBCommunityReplicaMerger();
  const initial = () =>
    merger.nextDocument(fixture(), undefined, undefined, 10);
  const edit = (
    base: OrbitDBCommunityDocument,
    changes: Partial<OrbitDBCommunityDocument>,
    now = 20,
  ) =>
    merger.nextDocument(
      { ...structuredClone(base), ...changes },
      base,
      base,
      now,
    );

  it.each([
    ['name', '', 123],
    ['visibility', '', 'invalid'],
    ['memberIds', 'member', { id: 'other', admission: 'token' }],
    [
      'memberRoles',
      'member',
      { identityId: 'member', admission: 'token', roleIds: 'alpha' },
    ],
    [
      'roles',
      'alpha',
      { id: 'alpha', name: 'role', builtIn: false, permissions: null },
    ],
    [
      'textChannels',
      'text',
      { id: 'text', name: 'channel', type: 'voice', createdAt: 1 },
    ],
    ['name', 'unexpected-id', 'Name'],
  ])(
    'rejects malformed %s state even when merged with legacy data',
    (field, id, value) => {
      const invalid = initial();
      invalid.replicaState!.entries[JSON.stringify([field, id])] = {
        revision: 1,
        removed: false,
        value,
      };
      expect(() => merger.merge(invalid, initial())).toThrow();
      expect(() => merger.merge(fixture(), invalid)).toThrow();
      expect(() => merger.merge(invalid, fixture())).toThrow();
    },
  );

  it('does not bind a local grant to an unseen concurrent readmission', () => {
    const base = initial();
    const removed = edit(base, { memberIds: ['owner'] });
    const remote = edit(removed, { memberIds: ['owner', 'member'] });
    remote.replicaState!.entries[
      JSON.stringify(['memberIds', 'member'])
    ].value = { id: 'member', admission: '!remote-admission' };
    const local = merger.nextDocument(
      {
        ...removed,
        memberIds: ['owner', 'member'],
        memberRoles: [{ identityId: 'member', roleIds: ['alpha'] }],
      },
      removed,
      remote,
      1000,
    );
    expect(local.memberIds).toContain('member');
    expect(roleIdsFor(local, 'member')).toEqual([]);
  });

  it('does not promote an unseen stale grant above a concurrent revocation', () => {
    const base = initial();
    const assigned = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['alpha'] }],
    });
    const revoked = edit(assigned, { memberRoles: [] });
    const staleGrant = merger.nextDocument(
      {
        ...assigned,
        memberRoles: [{ identityId: 'member', roleIds: ['alpha', 'beta'] }],
      },
      assigned,
      revoked,
      1000,
    );
    expect(roleIdsFor(staleGrant, 'member')).toEqual([]);
  });

  it('does not treat an obsolete admission as a fresh readmission after removal', () => {
    const base = initial();
    const added = edit(base, { memberIds: [...base.memberIds, 'new-member'] });
    const removed = edit(added, { memberIds: base.memberIds });
    const stale = merger.nextDocument(
      { ...base, memberIds: [...base.memberIds, 'new-member'] },
      base,
      removed,
      1000,
    );
    expect(stale.memberIds).not.toContain('new-member');
  });

  it('preserves two independent member additions from the same baseline', () => {
    const base = initial();
    const alice = edit(base, { memberIds: [...base.memberIds, 'alice'] });
    const bob = edit(base, { memberIds: [...base.memberIds, 'bob'] });
    const merged = merger.merge(alice, bob);
    expect([...merged.memberIds].sort()).toEqual([
      'alice',
      'bob',
      'member',
      'owner',
    ]);
    expect(merger.merge(bob, alice)).toEqual(merged);
  });

  it('preserves A, B and C additions under every ordering and parenthesization', () => {
    const base = initial();
    const writes = ['a', 'b', 'c'].map((identity, index) =>
      edit(base, { memberIds: [...base.memberIds, identity] }, 20 + index),
    );
    const expected = merger.merge(
      merger.merge(writes[0], writes[1]),
      writes[2],
    );
    expect([...expected.memberIds].sort()).toEqual([
      'a',
      'b',
      'c',
      'member',
      'owner',
    ]);
    for (const [a, b, c] of permutations(writes)) {
      expect(merger.merge(merger.merge(a, b), c)).toEqual(expected);
      expect(merger.merge(a, merger.merge(b, c))).toEqual(expected);
    }
    expect(merger.merge(expected, expected)).toEqual(expected);
    expect(merger.merge(expected, writes[0])).toEqual(expected);
  });

  it('merges different profile fields without discarding either edit', () => {
    const base = initial();
    const renamed = edit(base, { name: 'Renamed' });
    const described = edit(base, { description: 'New description' }, 30);
    expect(merger.merge(renamed, described)).toMatchObject({
      name: 'Renamed',
      description: 'New description',
    });
  });

  it('makes community deletion terminal against later stale saves and replay', () => {
    const base = initial();
    const deleted = merger.tombstone(base, base, 30);
    const stale = edit(base, { name: 'Stale resurrection' }, 1000);
    expect(merger.merge(deleted, stale).deleted).toBe(true);
    expect(merger.merge(stale, deleted)).toEqual(merger.merge(deleted, stale));
    expect(() =>
      merger.nextDocument(
        { ...base, name: 'Another save' },
        base,
        deleted,
        2000,
      ),
    ).toThrow();
  });

  it('does not resurrect a deleted channel when a stale aggregate is renamed', () => {
    const base = initial();
    const deleted = edit(base, { textChannels: [] }, 30);
    const next = merger.nextDocument(
      {
        ...base,
        textChannels: [{ ...base.textChannels[0], name: 'Stale rename' }],
      },
      base,
      deleted,
      1000,
    );
    expect(next.textChannels).toEqual([]);
    const stale = edit(
      base,
      { textChannels: [{ ...base.textChannels[0], name: 'Offline rename' }] },
      2000,
    );
    expect(merger.merge(stale, deleted).textChannels).toEqual([]);
  });

  it('keeps role and voice-channel UUID deletion terminal', () => {
    const base = initial();
    const deleted = edit(base, {
      roles: base.roles!.filter((role) => role.id !== 'alpha'),
      voiceChannels: [],
    });
    const stale = edit(
      base,
      {
        roles: base.roles!.map((role) =>
          role.id === 'alpha' ? { ...role, name: 'Renamed' } : role,
        ),
        voiceChannels: base.voiceChannels!.map((channel) => ({
          ...channel,
          name: 'Renamed',
        })),
      },
      1000,
    );
    const merged = merger.merge(deleted, stale);
    expect(merged.roles?.some((role) => role.id === 'alpha')).toBe(false);
    expect(merged.voiceChannels).toEqual([]);
    expect(merger.merge(stale, deleted)).toEqual(merged);
  });

  it('does not transfer a stale role grant into a new member admission', () => {
    const base = initial();
    const removed = edit(base, { memberIds: ['owner'] });
    const readmitted = edit(removed, { memberIds: ['owner', 'member'] }, 30);
    const grant = {
      memberRoles: [{ identityId: 'member', roleIds: ['alpha'] }],
    };
    const stale = edit(base, grant, 1000);
    expect(roleIdsFor(merger.merge(readmitted, stale), 'member')).toEqual([]);
    const staleSave = merger.nextDocument(
      { ...base, ...grant },
      base,
      readmitted,
      2000,
    );
    expect(staleSave.memberIds).toContain('member');
    expect(roleIdsFor(staleSave, 'member')).toEqual([]);
    const freshGrant = edit(readmitted, grant, 3000);
    expect(roleIdsFor(freshGrant, 'member')).toEqual(['alpha']);
  });

  it('preserves a remote addition during repeated saves with the last local snapshot as baseline', () => {
    const base = initial();
    const localSnapshot = { ...base, name: 'Local name' };
    const first = merger.nextDocument(localSnapshot, base, base, 20);
    const remote = edit(base, { memberIds: [...base.memberIds, 'remote'] }, 30);
    const current = merger.merge(first, remote);
    const second = merger.nextDocument(
      { ...localSnapshot, description: 'Second local edit' },
      first,
      current,
      40,
    );
    expect(second.memberIds).toContain('remote');
    expect(second).toMatchObject({
      name: 'Local name',
      description: 'Second local edit',
    });
  });

  it('does not allow a late legacy snapshot to replace versioned state', () => {
    const base = initial();
    const versioned = edit(base, { name: 'Versioned', memberIds: ['owner'] });
    const legacy = { ...fixture(), name: 'Late legacy', updatedAt: 9999999 };
    expect(merger.merge(versioned, legacy)).toEqual(versioned);
    expect(merger.merge(legacy, versioned)).toEqual(versioned);
    const deleted = merger.tombstone(versioned, versioned, 40);
    expect(merger.merge(deleted, legacy).deleted).toBe(true);
  });

  it('hides assignments to deleted roles after concurrent grant and deletion', () => {
    const base = initial();
    const granted = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['alpha'] }],
    });
    const removed = edit(base, {
      roles: base.roles!.filter((role) => role.id !== 'alpha'),
    });
    expect(roleIdsFor(merger.merge(granted, removed), 'member')).toEqual([]);
  });

  it('filters banned members and their role assignments from the materialized view', () => {
    const base = initial();
    const granted = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['alpha'] }],
    });
    const banned = edit(base, {
      bannedMemberIds: ['member'],
      memberIds: ['owner'],
    });
    const merged = merger.merge(granted, banned);
    expect(merged.bannedMemberIds).toContain('member');
    expect(merged.memberIds).not.toContain('member');
    expect(roleIdsFor(merged, 'member')).toEqual([]);
  });

  it('intersects conflicting equal-revision role assignments deterministically', () => {
    const base = initial();
    const a = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['alpha', 'shared'] }],
    });
    const b = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['beta', 'shared'] }],
    });
    const c = edit(base, {
      memberRoles: [{ identityId: 'member', roleIds: ['shared'] }],
    });
    const expected = merger.merge(merger.merge(a, b), c);
    expect(roleIdsFor(expected, 'member')).toEqual(['shared']);
    for (const [left, middle, right] of permutations([a, b, c])) {
      expect(merger.merge(merger.merge(left, middle), right)).toEqual(expected);
      expect(merger.merge(left, merger.merge(middle, right))).toEqual(expected);
    }
  });

  it('converges under every three-way role, ban and channel conflict ordering', () => {
    const base = initial();
    const writes = [
      edit(base, { memberRoles: [{ identityId: 'member', roleIds: ['alpha', 'shared'] }], bannedMemberIds: ['member'] }),
      edit(base, { memberRoles: [{ identityId: 'member', roleIds: ['beta', 'shared'] }], textChannels: [] }),
      edit(base, { memberRoles: [{ identityId: 'member', roleIds: ['shared'] }], textChannels: [{ ...base.textChannels[0], name: 'Renamed' }] }),
    ];
    const expected = merger.merge(merger.merge(writes[0], writes[1]), writes[2]);
    expect(expected.memberIds).not.toContain('member');
    expect(expected.memberRoles).toEqual([]);
    expect(expected.textChannels).toEqual([]);
    for (const [a, b, c] of permutations(writes)) {
      expect(merger.merge(merger.merge(a, b), c)).toEqual(expected);
      expect(merger.merge(a, merger.merge(b, c))).toEqual(expected);
      expect(merger.merge(expected, a)).toEqual(expected);
    }
    expect(merger.merge(expected, expected)).toEqual(expected);
  });

  it('materializes arrays deterministically regardless of insertion order', () => {
    const base = initial();
    const a = edit(base, { memberIds: ['z', ...base.memberIds, 'a'] });
    const b = edit(base, {
      memberIds: ['a', ...base.memberIds.slice().reverse(), 'z'],
    });
    expect(merger.merge(a, b)).toEqual(merger.merge(b, a));
    expect(merger.merge(a, b).memberIds).toEqual(['a', 'member', 'owner', 'z']);
  });
});
