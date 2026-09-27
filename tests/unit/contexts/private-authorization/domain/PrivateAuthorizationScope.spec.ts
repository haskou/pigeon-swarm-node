import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { PrivateAcceptedCapacityExceededError } from '@app/contexts/private-authorization/domain/errors/PrivateAcceptedCapacityExceededError';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivatePendingCapacityExceededError } from '@app/contexts/private-authorization/domain/errors/PrivatePendingCapacityExceededError';
import { PrivateAuthorizationScopeWasFrozenEvent } from '@app/contexts/private-authorization/domain/events/PrivateAuthorizationScopeWasFrozenEvent';
import { PrivateAuthorizationScopeWasPinnedEvent } from '@app/contexts/private-authorization/domain/events/PrivateAuthorizationScopeWasPinnedEvent';
import { PrivateControlOperationWasAcceptedEvent } from '@app/contexts/private-authorization/domain/events/PrivateControlOperationWasAcceptedEvent';

describe('PrivateAuthorizationScope', () => {
  const scopeId = 'scope';
  const ownerKey = 'owner-key';
  const memberKey = 'member-key';
  const genesis = () =>
    PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [ownerKey, memberKey],
      authorityKeys: [ownerKey],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: ownerKey,
      headHash: 'head-0',
      scopeId,
    });
  const operation = (
    change: Partial<ReturnType<PrivateControlOperation['toPrimitives']>> = {},
  ): PrivateControlOperation =>
    PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorizationRevision: 0,
      byteSize: 512,
      control: { parentHeadHash: 'head-0' },
      digest: 'digest-proposal',
      id: 'proposal',
      kind: 'membership.propose',
      mutation: { targetIdentityId: 'member', type: 'member.ban' },
      previousOperationIds: [],
      proposalOperationId: undefined,
      scopeId,
      ...change,
    });
  const successor = (
    change: Partial<
      ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>
    > = {},
  ): PrivateAuthorizationCheckpoint =>
    PrivateAuthorizationCheckpoint.fromPrimitives({
      admittedDeviceKeys: [ownerKey],
      authorityKeys: [ownerKey],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: ownerKey,
      headHash: 'head-1',
      parentHeadHash: 'head-0',
      revision: 1,
      revokedDeviceKeys: [memberKey],
      scopeId,
      ...change,
    });

  it('pins genesis once and emits a scope event', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    expect(scope.toPrimitives()).toMatchObject({
      genesisHash: 'genesis-hash',
      ownerDeviceKey: ownerKey,
      status: 'active',
      checkpoint: { headHash: 'head-0', revision: 0, scopeId },
    });
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateAuthorizationScopeWasPinnedEvent),
    ]);
    expect(() => scope.pinGenesis(genesis(), 'other-genesis')).toThrow(
      PrivateAuthorizationConflictError,
    );
    expect(scope.toPrimitives().status).toBe('frozen');
  });

  it('accepts a proposal once and treats an identical replay as a duplicate', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.pullDomainEvents();
    const proposal = operation();

    expect(scope.acceptProposal(proposal)).toBe('accepted');
    expect(scope.acceptProposal(proposal)).toBe('duplicate');
    expect(scope.toPrimitives().acceptedOperations).toHaveLength(1);
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateControlOperationWasAcceptedEvent),
    ]);
  });

  it('freezes when an operation identifier is reused with another digest', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(operation());
    scope.pullDomainEvents();

    expect(() =>
      scope.acceptProposal(operation({ digest: 'different-digest' })),
    ).toThrow(PrivateAuthorizationConflictError);
    expect(scope.toPrimitives().status).toBe('frozen');
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateAuthorizationScopeWasFrozenEvent),
    ]);
  });

  it('rejects a cross-author pending identifier collision without freezing', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(
      operation({
        authorizationRevision: 1,
        digest: 'owner-pending',
        id: 'pending-id',
      }),
    );
    scope.pullDomainEvents();

    expect(() =>
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          digest: 'member-collision',
          id: 'pending-id',
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
    expect(scope.toPrimitives()).toMatchObject({
      pendingOperations: [{ authorDeviceKey: ownerKey, id: 'pending-id' }],
      status: 'active',
    });
    expect(scope.pullDomainEvents()).toEqual([]);
  });

  it.each([
    ['wrong scope', { scopeId: 'other-scope' }],
    ['old revision', { authorizationRevision: -1 }],
    ['unknown author', { authorDeviceKey: 'unknown-key' }],
    ['unsupported kind', { kind: 'message.create' }],
    ['wrong parent head', { control: { parentHeadHash: 'other-head' } }],
  ])('rejects %s without changing accepted state', (_label, change) => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    expect(() => scope.acceptProposal(operation(change))).toThrow(
      InvalidPrivateAuthorizationError,
    );
    expect(scope.toPrimitives().acceptedOperations).toEqual([]);
  });

  it('queues future revisions and missing causal predecessors', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const future = operation({
      authorizationRevision: 1,
      digest: 'future-digest',
      id: 'future',
    });
    const orphan = operation({
      digest: 'orphan-digest',
      id: 'orphan',
      previousOperationIds: ['missing'],
    });

    expect(scope.acceptProposal(future)).toBe('pending');
    expect(scope.acceptProposal(orphan)).toBe('pending');
    expect(scope.toPrimitives().pendingOperations).toHaveLength(2);
  });

  it('commits the exact proposed mutation with an exact successor checkpoint', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const proposal = operation();
    scope.acceptProposal(proposal);
    const commit = operation({
      digest: 'digest-commit',
      id: 'commit',
      kind: 'membership.commit',
      previousOperationIds: ['proposal'],
      proposalOperationId: 'proposal',
    });

    expect(scope.commitTransition(commit, successor())).toBe('accepted');
    expect(scope.toPrimitives()).toMatchObject({
      checkpoint: { headHash: 'head-1', revision: 1 },
      acceptedOperations: [{ id: 'proposal' }, { id: 'commit' }],
    });
  });

  it.each([
    ['missing proposal', { proposalOperationId: 'missing' }, {}],
    [
      'different mutation',
      {},
      { mutation: { targetIdentityId: 'other', type: 'member.ban' } },
    ],
    ['skipped revision', {}, { checkpoint: { revision: 2 } }],
    ['wrong parent', {}, { checkpoint: { parentHeadHash: 'other-head' } }],
    ['wrong scope', {}, { checkpoint: { scopeId: 'other-scope' } }],
  ])(
    'rejects transition with %s',
    (
      _label,
      operationChange: Record<string, unknown>,
      transitionChange: {
        checkpoint?: Record<string, unknown>;
        mutation?: Record<string, unknown>;
      },
    ) => {
      const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
      scope.acceptProposal(operation());
      const commit = operation({
        digest: 'digest-commit',
        id: 'commit',
        kind: 'membership.commit',
        mutation:
          transitionChange.mutation ?? operation().toPrimitives().mutation,
        previousOperationIds: ['proposal'],
        proposalOperationId: 'proposal',
        ...operationChange,
      });

      expect(() =>
        scope.commitTransition(
          commit,
          successor(transitionChange.checkpoint ?? {}),
        ),
      ).toThrow(InvalidPrivateAuthorizationError);
    },
  );

  it('revokes an admitted device only with the matching successor policy', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const revocation = operation({
      digest: 'digest-revoke',
      id: 'revoke',
      kind: 'device.revoke',
      mutation: { deviceKey: memberKey, type: 'device.revoke' },
    });

    expect(scope.revokeDevice(revocation, successor())).toBe('accepted');
    expect(() =>
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          digest: 'revoked-author',
          id: 'revoked-author',
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('prunes obsolete pending operations after a checkpoint transition', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(
      operation({
        authorDeviceKey: memberKey,
        authorizationRevision: 1,
        digest: 'revoked-pending',
        id: 'revoked-pending',
      }),
    );
    scope.acceptProposal(
      operation({
        authorizationRevision: 1,
        control: { parentHeadHash: 'wrong-head' },
        digest: 'wrong-parent',
        id: 'wrong-parent',
      }),
    );
    scope.acceptProposal(
      operation({
        authorizationRevision: 2,
        control: { parentHeadHash: 'head-1' },
        digest: 'future',
        id: 'future',
      }),
    );

    expect(
      scope.revokeDevice(
        operation({
          digest: 'digest-revoke',
          id: 'revoke',
          kind: 'device.revoke',
          mutation: { deviceKey: memberKey, type: 'device.revoke' },
        }),
        successor(),
      ),
    ).toBe('accepted');
    expect(scope.toPrimitives().pendingOperations.map(({ id }) => id)).toEqual([
      'future',
    ]);
  });

  it('prunes obsolete pending operations before enforcing capacity', () => {
    const scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: [],
      checkpoint: genesis().toPrimitives(),
      genesisHash: 'genesis-hash',
      ownerDeviceKey: ownerKey,
      pendingOperations: Array.from({ length: 128 }, (_value, index) =>
        operation({
          authorizationRevision: -1,
          byteSize: 1,
          digest: `obsolete-${index}`,
          id: `obsolete-${index}`,
        }).toPrimitives(),
      ),
      status: 'active',
    });

    expect(
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'new-pending',
          id: 'new-pending',
        }),
      ),
    ).toBe('pending');
    expect(scope.toPrimitives().pendingOperations).toHaveLength(1);
  });

  it('rejects revocation when the candidate still admits the device', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const revocation = operation({
      digest: 'digest-revoke',
      id: 'revoke',
      kind: 'device.revoke',
      mutation: { deviceKey: memberKey, type: 'device.revoke' },
    });

    expect(() =>
      scope.revokeDevice(
        revocation,
        successor({
          admittedDeviceKeys: [ownerKey, memberKey],
          revokedDeviceKeys: [],
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('returns retryable pending operations in deterministic operation-id order', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(
      operation({
        digest: 'digest-z',
        id: 'z',
        previousOperationIds: ['dependency'],
      }),
    );
    scope.acceptProposal(
      operation({
        digest: 'digest-a',
        id: 'a',
        previousOperationIds: ['dependency'],
      }),
    );
    scope.acceptProposal(
      operation({ digest: 'dependency-digest', id: 'dependency' }),
    );

    expect(
      scope.retryable().map((pending) => pending.toPrimitives().id),
    ).toEqual(['a', 'z']);
  });

  it('promotes an identical pending operation once its predecessors are accepted', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const dependent = operation({
      digest: 'dependent-digest',
      id: 'dependent',
      previousOperationIds: ['dependency'],
    });

    expect(scope.acceptProposal(dependent)).toBe('pending');
    expect(
      scope.acceptProposal(
        operation({ digest: 'dependency-digest', id: 'dependency' }),
      ),
    ).toBe('accepted');
    expect(scope.acceptProposal(dependent)).toBe('accepted');
    expect(scope.toPrimitives().pendingOperations).toEqual([]);
  });

  it('reserves accepted operation capacity for checkpoint progress', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    for (let index = 0; index < 8; index++) {
      expect(
        scope.acceptProposal(
          operation({
            authorDeviceKey: memberKey,
            byteSize: 1,
            digest: `accepted-${index}`,
            id: `accepted-${index}`,
          }),
        ),
      ).toBe('accepted');
    }

    expect(() =>
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          byteSize: 1,
          digest: 'accepted-overflow',
          id: 'accepted-overflow',
        }),
      ),
    ).toThrow(PrivateAcceptedCapacityExceededError);
    expect(
      scope.acceptProposal(
        operation({
          byteSize: 1,
          digest: 'authority-progress',
          id: 'authority-progress',
        }),
      ),
    ).toBe('accepted');
  });

  it('bounds accepted operation bytes per author', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    expect(
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          byteSize: 512 * 1024,
          digest: 'accepted-at-limit',
          id: 'accepted-at-limit',
        }),
      ),
    ).toBe('accepted');

    expect(() =>
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          byteSize: 1,
          digest: 'accepted-overflow',
          id: 'accepted-overflow',
        }),
      ),
    ).toThrow(PrivateAcceptedCapacityExceededError);
  });

  it('compacts old accepted history after advancing the checkpoint', () => {
    const scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: Array.from({ length: 128 }, (_value, index) =>
        operation({
          byteSize: 1,
          digest: `accepted-${index}`,
          id: `accepted-${index}`,
        }).toPrimitives(),
      ),
      checkpoint: genesis().toPrimitives(),
      genesisHash: 'genesis-hash',
      ownerDeviceKey: ownerKey,
      pendingOperations: [],
      status: 'active',
    });

    expect(
      scope.revokeDevice(
        operation({
          byteSize: 1,
          digest: 'digest-revoke',
          id: 'revoke',
          kind: 'device.revoke',
          mutation: { deviceKey: memberKey, type: 'device.revoke' },
        }),
        successor(),
      ),
    ).toBe('accepted');
    expect(scope.toPrimitives().acceptedOperations).toHaveLength(32);
    expect(
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          control: { parentHeadHash: 'head-1' },
          digest: 'next-revision',
          id: 'next-revision',
        }),
      ),
    ).toBe('accepted');
  });

  it('retains compacted history required by a future pending operation', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(
      operation({ digest: 'dependency-digest', id: 'dependency' }),
    );
    scope.acceptProposal(
      operation({
        authorizationRevision: 1,
        control: { parentHeadHash: 'head-1' },
        digest: 'future-digest',
        id: 'future',
        previousOperationIds: ['dependency'],
      }),
    );

    scope.revokeDevice(
      operation({
        digest: 'digest-revoke',
        id: 'revoke',
        kind: 'device.revoke',
        mutation: { deviceKey: memberKey, type: 'device.revoke' },
      }),
      successor(),
    );

    expect(
      scope.toPrimitives().acceptedOperations.map(({ id }) => id),
    ).toContain('dependency');
    expect(
      scope.retryable().map((pending) => pending.toPrimitives().id),
    ).toEqual(['future']);
  });

  it('reserves accepted slots for checkpoint progress when pending dependencies pin history', () => {
    const acceptedOperations = Array.from({ length: 128 }, (_value, index) =>
      operation({
        byteSize: 1,
        digest: `accepted-${index}`,
        id: `accepted-${index}`,
      }).toPrimitives(),
    );
    const scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations,
      checkpoint: genesis().toPrimitives(),
      genesisHash: 'genesis-hash',
      ownerDeviceKey: ownerKey,
      pendingOperations: [],
      status: 'active',
    });

    for (let batch = 0; batch < 3; batch++) {
      expect(
        scope.acceptProposal(
          operation({
            authorizationRevision: 1,
            byteSize: 1,
            digest: `pending-${batch}`,
            id: `pending-${batch}`,
            previousOperationIds: acceptedOperations
              .slice(batch * 32, (batch + 1) * 32)
              .map(({ id }) => id),
          }),
        ),
      ).toBe('pending');
    }

    expect(() =>
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'pending-overflow',
          id: 'pending-overflow',
          previousOperationIds: acceptedOperations
            .slice(96)
            .map(({ id }) => id),
        }),
      ),
    ).toThrow(PrivateAcceptedCapacityExceededError);
    expect(
      scope.revokeDevice(
        operation({
          byteSize: 1,
          digest: 'progress',
          id: 'progress',
          kind: 'device.revoke',
          mutation: { deviceKey: memberKey, type: 'device.revoke' },
        }),
        successor(),
      ),
    ).toBe('accepted');
  });

  it('reserves accepted bytes for checkpoint progress when dependencies pin history', () => {
    const acceptedOperations = Array.from({ length: 4 }, (_value, index) =>
      operation({
        byteSize: 1024 * 1024,
        digest: `accepted-bytes-${index}`,
        id: `accepted-bytes-${index}`,
      }).toPrimitives(),
    );
    const scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations,
      checkpoint: genesis().toPrimitives(),
      genesisHash: 'genesis-hash',
      ownerDeviceKey: ownerKey,
      pendingOperations: [],
      status: 'active',
    });

    expect(
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'pinned-bytes',
          id: 'pinned-bytes',
          previousOperationIds: acceptedOperations
            .slice(0, 3)
            .map(({ id }) => id),
        }),
      ),
    ).toBe('pending');
    expect(() =>
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'pinned-byte-overflow',
          id: 'pinned-byte-overflow',
          previousOperationIds: [acceptedOperations[3].id],
        }),
      ),
    ).toThrow(PrivateAcceptedCapacityExceededError);
  });

  it('enforces both pending queue bounds without acknowledging overflow', () => {
    const countBound = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    for (let index = 0; index < 128; index++) {
      expect(
        countBound.acceptProposal(
          operation({
            authorDeviceKey: index < 64 ? ownerKey : memberKey,
            authorizationRevision: 1,
            byteSize: 1,
            digest: `digest-${index}`,
            id: `pending-${index}`,
          }),
        ),
      ).toBe('pending');
    }
    expect(() =>
      countBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'overflow-count',
          id: 'overflow-count',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);

    const byteBound = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    expect(
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 512 * 1024,
          digest: 'owner-bytes',
          id: 'owner-bytes',
        }),
      ),
    ).toBe('pending');
    expect(
      byteBound.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          byteSize: 512 * 1024,
          digest: 'member-bytes',
          id: 'member-bytes',
        }),
      ),
    ).toBe('pending');
    expect(() =>
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'overflow-bytes',
          id: 'overflow-bytes',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);
  });

  it('reserves pending capacity for another admitted author', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    for (let index = 0; index < 96; index++) {
      expect(
        scope.acceptProposal(
          operation({
            authorizationRevision: 1,
            byteSize: 1,
            digest: `owner-digest-${index}`,
            id: `owner-pending-${index}`,
          }),
        ),
      ).toBe('pending');
    }

    expect(() =>
      scope.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'owner-overflow',
          id: 'owner-overflow',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);
    expect(
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'member-pending',
          id: 'member-pending',
        }),
      ),
    ).toBe('pending');

    const byteBound = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    expect(
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 768 * 1024,
          digest: 'owner-byte-capacity',
          id: 'owner-byte-capacity',
        }),
      ),
    ).toBe('pending');
    expect(() =>
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'owner-byte-overflow',
          id: 'owner-byte-overflow',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);
    expect(
      byteBound.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'member-byte-capacity',
          id: 'member-byte-capacity',
        }),
      ),
    ).toBe('pending');
  });

  it('hydrates without inventing domain events', () => {
    const original = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    original.acceptProposal(operation());

    const hydrated = PrivateAuthorizationScope.fromPrimitives(
      original.toPrimitives(),
    );

    expect(hydrated.toPrimitives()).toEqual(original.toPrimitives());
    expect(hydrated.pullDomainEvents()).toEqual([]);
  });
});
