import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import OrbitDBIdentityPresenceRepository from '@app/contexts/presence/infrastructure/orbitdb/OrbitDBIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIdentityPresenceRepository', () => {
  const headRecords = new Map<string, Record<string, unknown>>();
  const documents: Record<string, unknown>[] = [];
  const identityMother = new IdentityMother();
  let query: jest.Mock;
  let repository: OrbitDBIdentityPresenceRepository;
  let registry: OrbitDBReplicatedStateRegistry;

  beforeEach(() => {
    documents.splice(0);
    headRecords.clear();
    query = jest.fn(async (matcher) => documents.filter(matcher));
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('550e8400-e29b-41d4-a716-446655440001', {
      heads: {
        all: jest.fn(async () =>
          [...headRecords.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: jest.fn(async (key) => ({ key, value: headRecords.get(key) })),
        put: jest.fn(async (key, value) => {
          headRecords.set(key as string, value as Record<string, unknown>);

          return 'ok';
        }),
      },
      presence: {
        put: jest.fn(async (document) => {
          documents.push(document);

          return 'ok';
        }),
        query,
      },
    } as never);
    repository = new OrbitDBIdentityPresenceRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should find presence by identity from the direct head', async () => {
    const identityId = identityMother.id.valueOf();

    headRecords.set(`presence:${identityId}`, presenceDocument(identityId));

    const presence = await repository.findByIdentityId(
      new IdentityId(identityId),
    );

    expect(presence?.toPrimitives()).toEqual(
      expect.objectContaining({
        identityId,
        status: 'available',
      }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('should save presence into the document store and direct head', async () => {
    const identityId = identityMother.id.valueOf();
    const presence = IdentityPresence.fromPrimitives({
      identityId,
      status: 'available',
      updatedAt: 1780000000000,
    });

    await repository.save(presence, ['550e8400-e29b-41d4-a716-446655440001']);

    expect(headRecords.get(`presence:${identityId}`)).toEqual(
      expect.objectContaining({
        identityId,
        status: 'available',
      }),
    );
  });

  it('should fetch a presence list from heads before scanning documents', async () => {
    const identityId = identityMother.id.valueOf();

    headRecords.set(`presence:${identityId}`, presenceDocument(identityId));

    const presences = await repository.findByIdentityIds([
      new IdentityId(identityId),
    ]);

    expect(presences).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
  });

  it('should find potentially expired presences from heads', async () => {
    const identityId = identityMother.id.valueOf();
    const presence = IdentityPresence.fromPrimitives({
      identityId,
      lastHeartbeatAt: 100,
      status: 'available',
      updatedAt: 1780000000000,
    });

    await repository.save(presence, ['550e8400-e29b-41d4-a716-446655440001']);

    const presences = await repository.findPotentiallyExpired(
      new Timestamp(200),
    );

    expect(presences).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
  });
});

function presenceDocument(identityId: string): Record<string, unknown> {
  return {
    id: identityId,
    identityId,
    status: 'available',
    updatedAt: 1780000000000,
  };
}
