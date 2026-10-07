import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import CommunityChannelMessageMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageMutationPolicy';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityInviteMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteMutationPolicy';
import CommunityInviteUseMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteUseMutationPolicy';
import CommunityMembershipRequestMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityMembershipRequestMutationPolicy';
import CommunityModerationLogMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityModerationLogMutationPolicy';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
import PollCloseMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollCloseMutationPolicy';
import PollMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationPolicy';
import PollMutationScopeAccess from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationScopeAccess';
import PollVoteMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollVoteMutationPolicy';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerFavoriteMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerFavoriteMutationPolicy';
import StickerPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerPackMutationPolicy';
import StickerRecentMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerRecentMutationPolicy';
import StickerSavedPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerSavedPackMutationPolicy';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe('PublicMutationGate over pins', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const id = 'community:c1:ch1:m1';
  const pin = {
    channelId: 'ch1',
    communityId: 'c1',
    createdAt: 1780000000000,
    id,
    messageId: 'm1',
    pinnedByIdentityId: author,
    scopeType: 'community_channel',
  };
  const tombstone = {
    channelId: 'ch1',
    communityId: 'c1',
    id,
    messageId: 'm1',
    pinnedByIdentityId: author,
    removed: true,
    scopeType: 'community_channel',
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    kind: 'put' | 'delete',
    sequence: number,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind,
      operationId: `operation-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: sequence }),
      recordId: id,
      sequence,
      store: 'pins',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(
      mock<Community>({ manageChannelMessages: jest.fn() }),
    );
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityChannelMessagePinMutationPolicy(communityRepository),
    ]);
  });

  it('admits a signed pin and a signed unpin', async () => {
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      true,
    );
    await expect(
      gate.accepts('pins', await sign(tombstone, 'delete', 2)),
    ).resolves.toBe(true);
  });

  it('rejects a forged future-dated tombstone without proof', async () => {
    await expect(
      gate.accepts('pins', { ...tombstone, updatedAt: Date.now() + 10 ** 12 }),
    ).resolves.toBe(false);
  });

  it('rejects a put proof replayed as a tombstone', async () => {
    const signed = await sign(pin, 'put', 1);

    await expect(
      gate.accepts('pins', { ...tombstone, proof: signed.proof }),
    ).resolves.toBe(false);
  });

  it('rejects a proof copied onto another scope', async () => {
    const signed = await sign(pin, 'put', 1);

    await expect(
      gate.accepts('pins', {
        ...signed,
        channelId: 'ch2',
        id: 'community:c1:ch2:m1',
      }),
    ).resolves.toBe(false);
  });

  it('rejects revoked devices and insufficient permissions', async () => {
    authorization.isAuthorized.mockResolvedValueOnce(false);
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      false,
    );

    communityRepository.findById.mockResolvedValue(
      mock<Community>({
        manageChannelMessages: jest.fn(() => {
          throw new Error('forbidden');
        }),
      }),
    );
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      false,
    );
  });

  it('keeps the signed pin when a forged tombstone is replicated', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const signed = await sign(pin, 'put', 1);
    const forged = { ...tombstone, updatedAt: Date.now() + 10 ** 12 };
    const documents = [signed, forged];

    await registry.register('n', {
      heads: { events: { on: jest.fn() } },
      pins: {
        query: jest.fn((matcher: (d: Record<string, unknown>) => boolean) =>
          Promise.resolve(documents.filter(matcher)),
        ),
      },
    } as never);
    registry.addMutationGate(gate);

    await expect(registry.queryDocuments('pins', () => true)).resolves.toEqual([
      signed,
    ]);
    registry.clear();
  });

  it('re-admits a demoted head once the permission data replicates', async () => {
    jest.useFakeTimers();
    const registry = new OrbitDBReplicatedStateRegistry();
    const signed = await sign(pin, 'put', 1);
    let onUpdate: (entry: unknown) => void = () => undefined;

    communityRepository.findById.mockResolvedValue(undefined);
    await registry.register('n', {
      heads: {
        events: {
          on: jest.fn((event: string, handler: (entry: unknown) => void) => {
            if (event === 'update') onUpdate = handler;
          }),
        },
      },
    } as never);
    registry.addMutationGate(gate);

    onUpdate({ payload: { key: 'pins-head', value: { pins: [signed] } } });
    await jest.advanceTimersByTimeAsync(10);
    expect(registry.findCachedHead('pins-head')?.pins).toEqual([]);

    communityRepository.findById.mockResolvedValue(
      mock<Community>({ manageChannelMessages: jest.fn() }),
    );
    await jest.advanceTimersByTimeAsync(2_500);

    expect(registry.findCachedHead('pins-head')?.pins).toEqual([signed]);
    registry.clear();
    jest.useRealTimers();
  });
});

describe('PublicMutationGate over conversation pins', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const conversationId = 'one-to-one:c1';
  const id = `conversation:${conversationId}:m1`;
  const pin = {
    conversationId,
    createdAt: 1780000000000,
    id,
    messageId: 'm1',
    pinnedByIdentityId: author,
    scopeType: 'conversation',
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const conversationRepository = mock<ConversationRepository>();
  const communityRepository = mock<CommunityRepository>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind: 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: null as string | null,
      recordId: payload.id as string,
      sequence: 0,
      store: 'pins',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    conversationRepository.findMetadataById.mockResolvedValue(
      mock<Conversation>({ hasParticipant: jest.fn(() => true) }),
    );
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityChannelMessagePinMutationPolicy(communityRepository),
      new ConversationMessagePinMutationPolicy(conversationRepository),
    ]);
  });

  it('admits a signed conversation pin from a participant', async () => {
    await expect(gate.accepts('pins', await sign(pin))).resolves.toBe(true);
  });

  it('rejects a pin from someone who is not a participant', async () => {
    conversationRepository.findMetadataById.mockResolvedValue(
      mock<Conversation>({ hasParticipant: jest.fn(() => false) }),
    );

    await expect(gate.accepts('pins', await sign(pin))).resolves.toBe(false);
  });

  it('rejects a conversation proof copied onto another conversation', async () => {
    const signed = await sign(pin);

    await expect(
      gate.accepts('pins', {
        ...signed,
        conversationId: 'one-to-one:c2',
        id: 'conversation:one-to-one:c2:m1',
      }),
    ).resolves.toBe(false);
  });

  it('rejects a record whose scope type has no policy in the collection', async () => {
    const unknownScope = { ...pin, scopeType: 'mystery' };

    await expect(gate.accepts('pins', await sign(unknownScope))).resolves.toBe(
      false,
    );
  });

  it('rejects an unsigned conversation pin', async () => {
    await expect(gate.accepts('pins', pin)).resolves.toBe(false);
  });
});

describe('PublicMutationGate over notification settings', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const scope = { communityId: 'c1', type: 'community' };
  const id = `${author}:community:c1`;
  const settings = {
    hideMutedChannels: false,
    id,
    identityId: author,
    mobilePushEnabled: true,
    notificationLevel: 'all',
    scope,
    scopeKey: 'community:c1',
    scopeType: 'notification_settings',
    suppressEveryoneAndHere: false,
    suppressRoleMentions: false,
    updatedAt: 1780000000000,
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    signer: string = author,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: signer,
      },
      kind: payload.removed === true ? 'delete' : 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: null as string | null,
      recordId: payload.id as string,
      sequence: 0,
      store: 'notificationSettings',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new NotificationScopeSettingsMutationPolicy(),
    ]);
  });

  it('admits signed settings and a signed reset from their owner', async () => {
    await expect(
      gate.accepts('notificationSettings', await sign(settings)),
    ).resolves.toBe(true);
    await expect(
      gate.accepts(
        'notificationSettings',
        await sign({
          id,
          identityId: author,
          removed: true,
          scopeKey: 'community:c1',
          scopeType: 'notification_settings',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects unsigned settings and a forged future-dated reset', async () => {
    await expect(gate.accepts('notificationSettings', settings)).resolves.toBe(
      false,
    );
    await expect(
      gate.accepts('notificationSettings', {
        id,
        identityId: author,
        removed: true,
        scopeKey: 'community:c1',
        scopeType: 'notification_settings',
        updatedAt: Date.now() + 10 ** 12,
      }),
    ).resolves.toBe(false);
  });

  it('rejects settings signed by someone other than the owner', async () => {
    const otherAuthor = 'MCowBQYDK2VwAyEA' + 'A'.repeat(43) + '=';

    await expect(
      gate.accepts('notificationSettings', await sign(settings, otherAuthor)),
    ).resolves.toBe(false);
  });

  it('rejects a proof copied onto another scope', async () => {
    const signed = await sign(settings);

    await expect(
      gate.accepts('notificationSettings', {
        ...signed,
        id: `${author}:community:c2`,
        scope: { communityId: 'c2', type: 'community' },
        scopeKey: 'community:c2',
      }),
    ).resolves.toBe(false);
  });

  it('rejects settings whose key does not match their scope', async () => {
    await expect(
      gate.accepts(
        'notificationSettings',
        await sign({ ...settings, scopeKey: 'community:c2' }),
      ),
    ).resolves.toBe(false);
  });
});

describe('PublicMutationGate over stickers', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const otherAuthor = 'MCowBQYDK2VwAyEA' + 'A'.repeat(43) + '=';
  const sticker = {
    assetCid: 'bagaaierastickerassetcid',
    contentType: 'image/png',
    dimensions: { height: 128, width: 128 },
    id: 's1',
    sizeBytes: 32768,
    type: 'static',
  };
  const pack = {
    createdAt: 1780000000000,
    id: 'p1',
    name: 'Pigeon moods',
    ownerIdentityId: author,
    scopeType: 'sticker_pack',
    stickers: [sticker],
    updatedAt: 1780000000001,
  };
  const favorite = {
    favoritedAt: 1780000000000,
    id: `favorite:${author}:p1:s1`,
    identityId: author,
    packId: 'p1',
    scopeType: 'sticker_favorite',
    stickerId: 's1',
  };
  const favoriteTombstone = {
    id: favorite.id,
    identityId: author,
    packId: 'p1',
    removed: true,
    scopeType: 'sticker_favorite',
    stickerId: 's1',
  };
  const saved = {
    id: `saved:${author}:p1`,
    identityId: author,
    packId: 'p1',
    savedAt: 1780000000000,
    scopeType: 'sticker_saved_pack',
  };
  const savedTombstone = {
    id: saved.id,
    identityId: author,
    packId: 'p1',
    removed: true,
    scopeType: 'sticker_saved_pack',
  };
  const recent = {
    id: `recent:${author}:p1:s1`,
    identityId: author,
    packId: 'p1',
    scopeType: 'sticker_recent',
    stickerId: 's1',
    usedAt: 1780000000000,
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  let gate: PublicMutationGate;

  const sign = async (
    store: string,
    payload: Record<string, unknown>,
    signer: string = author,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: signer,
      },
      kind: payload.removed === true ? 'delete' : 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: null as string | null,
      recordId: payload.id as string,
      sequence: 0,
      store,
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  const cases: [string, string, Record<string, unknown>][] = [
    ['stickerPacks', 'pack', pack],
    ['stickerUserLibraries', 'favorite', favorite],
    ['stickerUserLibraries', 'saved pack', saved],
    ['stickerUserLibraries', 'recent', recent],
  ];

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new StickerPackMutationPolicy(),
      new StickerFavoriteMutationPolicy(),
      new StickerSavedPackMutationPolicy(),
      new StickerRecentMutationPolicy(),
    ]);
  });

  it.each(cases)('admits a signed %s from its owner', async (store, _, doc) => {
    await expect(gate.accepts(store, await sign(store, doc))).resolves.toBe(
      true,
    );
  });

  it.each(cases)('rejects an unsigned %s', async (store, _, doc) => {
    await expect(gate.accepts(store, doc)).resolves.toBe(false);
  });

  it.each(cases)(
    'rejects a %s signed by someone else',
    async (store, _, doc) => {
      await expect(
        gate.accepts(store, await sign(store, doc, otherAuthor)),
      ).resolves.toBe(false);
    },
  );

  it('admits signed unfavorite and forget tombstones', async () => {
    await expect(
      gate.accepts(
        'stickerUserLibraries',
        await sign('stickerUserLibraries', favoriteTombstone),
      ),
    ).resolves.toBe(true);
    await expect(
      gate.accepts(
        'stickerUserLibraries',
        await sign('stickerUserLibraries', savedTombstone),
      ),
    ).resolves.toBe(true);
  });

  it('rejects forged future-dated tombstones without proof', async () => {
    await expect(
      gate.accepts('stickerUserLibraries', {
        ...favoriteTombstone,
        usedAt: Date.now() + 10 ** 12,
      }),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('stickerPacks', {
        id: 'p1',
        ownerIdentityId: author,
        removed: true,
        scopeType: 'sticker_pack',
        updatedAt: Date.now() + 10 ** 12,
      }),
    ).resolves.toBe(false);
  });

  it('rejects a proof copied onto another record', async () => {
    const signedPack = await sign('stickerPacks', pack);
    const signedFavorite = await sign('stickerUserLibraries', favorite);

    await expect(
      gate.accepts('stickerPacks', {
        ...signedPack,
        id: 'p2',
        name: 'Hijacked',
      }),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('stickerUserLibraries', {
        ...signedFavorite,
        id: `favorite:${author}:p1:s2`,
        stickerId: 's2',
      }),
    ).resolves.toBe(false);
  });

  it('rejects library records whose id does not match their fields', async () => {
    await expect(
      gate.accepts(
        'stickerUserLibraries',
        await sign('stickerUserLibraries', {
          ...favorite,
          id: `favorite:${author}:p9:s1`,
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'stickerUserLibraries',
        await sign('stickerUserLibraries', {
          ...saved,
          id: `recent:${author}:p1`,
        }),
      ),
    ).resolves.toBe(false);
  });

  it('rejects malformed packs and stickers', async () => {
    await expect(
      gate.accepts(
        'stickerPacks',
        await sign('stickerPacks', { ...pack, extra: true }),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'stickerPacks',
        await sign('stickerPacks', {
          ...pack,
          stickers: [{ ...sticker, smuggled: 'x' }],
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'stickerPacks',
        await sign('stickerPacks', {
          ...pack,
          stickers: [{ ...sticker, type: 'hologram' }],
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'stickerUserLibraries',
        await sign('stickerUserLibraries', { ...recent, usedAt: 'later' }),
      ),
    ).resolves.toBe(false);
  });
});

describe('PublicMutationGate over community invites and requests', () => {
  const creator =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const invitee =
    'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=';
  const communityId = '550e8400-e29b-41d4-a716-446655440000';
  const createdAt = 1780000000000;
  const nonce = 'nonce-0123456789abcdef';
  const token = CommunityInviteToken.derive(
    communityId,
    creator,
    nonce,
  ).valueOf();
  const requestId = CommunityRequestId.derive(
    communityId,
    'invitation',
    creator,
    invitee,
    createdAt,
  ).valueOf();
  const invite = {
    communityId,
    createdAt,
    creatorIdentityId: creator,
    id: token,
    maxUses: 1,
    nonce,
    scopeType: 'community_invite',
    token,
  };
  const use = {
    communityId,
    id: `invite-use:${token}:${invitee}`,
    identityId: invitee,
    scopeType: 'community_invite_use',
    token,
    usedAt: createdAt,
  };
  const request = {
    communityId,
    createdAt,
    creatorIdentityId: creator,
    id: requestId,
    identityId: invitee,
    scopeType: 'community_membership_request',
    status: 'pending',
    type: 'invitation',
    updatedAt: createdAt,
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  const inviteRepository = mock<CommunityInviteRepository>();
  const community = mock<Community>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    author: string,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind: 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: 1 }),
      recordId: payload.id as string,
      sequence: 1,
      store: 'requests',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(community);
    community.assertCanCreateInvite.mockReset();
    community.assertMembershipRequestAuthoredBy.mockReset();
    community.requestMembership.mockReset();
    inviteRepository.findByToken.mockResolvedValue(
      CommunityInvite.fromPrimitives(invite as never),
    );
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityInviteMutationPolicy(communityRepository as never),
      new CommunityInviteUseMutationPolicy(
        communityRepository as never,
        inviteRepository,
      ),
      new CommunityMembershipRequestMutationPolicy(
        communityRepository as never,
      ),
    ]);
  });

  it('admits a signed invite, use and request from the right authors', async () => {
    await expect(
      gate.accepts('requests', await sign(invite, creator)),
    ).resolves.toBe(true);
    await expect(
      gate.accepts('requests', await sign(use, invitee)),
    ).resolves.toBe(true);
    await expect(
      gate.accepts('requests', await sign(request, creator)),
    ).resolves.toBe(true);
  });

  it('rejects unsigned records of every scope', async () => {
    for (const record of [invite, use, request]) {
      await expect(gate.accepts('requests', record)).resolves.toBe(false);
    }
  });

  it('rejects an invite whose token is not derived from its fields', async () => {
    const forged = { ...invite, id: 'forged', token: 'forged' };

    await expect(
      gate.accepts('requests', await sign(forged, creator)),
    ).resolves.toBe(false);
  });

  it('rejects an invite signed by someone other than its creator', async () => {
    await expect(
      gate.accepts('requests', await sign(invite, invitee)),
    ).resolves.toBe(false);
  });

  it('rejects an invite use recorded by another identity', async () => {
    await expect(
      gate.accepts('requests', await sign(use, creator)),
    ).resolves.toBe(false);
  });

  it('rejects a use of an invite that belongs to another community', async () => {
    inviteRepository.findByToken.mockResolvedValue(undefined);

    await expect(
      gate.accepts('requests', await sign(use, invitee)),
    ).resolves.toBe(false);
  });

  it('rejects a request whose id is not derived from its immutable fields', async () => {
    const forged = { ...request, id: '123456789012345678901234' };

    await expect(
      gate.accepts('requests', await sign(forged, creator)),
    ).resolves.toBe(false);
  });

  it('rejects a request the community does not allow the author to publish', async () => {
    community.assertMembershipRequestAuthoredBy.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(
      gate.accepts('requests', await sign(request, creator)),
    ).resolves.toBe(false);
  });

  it('rejects records of an unknown community', async () => {
    communityRepository.findById.mockResolvedValue(undefined);

    await expect(
      gate.accepts('requests', await sign(invite, creator)),
    ).resolves.toBe(false);
  });
});

describe('PublicMutationGate over polls', () => {
  const creator =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const voter = 'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=';
  const createdAt = 1780000000000;
  const scope = { channelId: 'channel-1', communityId: 'community-1' };
  const poll = {
    ...scope,
    allowsMultipleVotes: false,
    createdAt,
    creatorIdentityId: creator,
    id: 'poll-1',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    question: 'Which?',
    scopeType: 'poll',
  };
  const vote = {
    ...scope,
    createdAt,
    id: `poll-vote:poll-1:${voter}`,
    optionIds: ['a'],
    pollId: 'poll-1',
    scopeType: 'poll_vote',
    voterIdentityId: voter,
  };
  const voteTombstone = {
    id: vote.id,
    pollId: 'poll-1',
    removed: true,
    scopeType: 'poll_vote',
    voterIdentityId: voter,
  };
  const close = {
    ...scope,
    closedByIdentityId: creator,
    createdAt,
    id: 'poll-close:poll-1',
    pollId: 'poll-1',
    scopeType: 'poll_close',
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  const conversationRepository = mock<ConversationRepository>();
  const community = mock<Community>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    author: string,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind: payload.removed === true ? 'delete' : 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: 1 }),
      recordId: payload.id as string,
      sequence: 1,
      store: 'polls',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(community);
    community.authorizeTextChannelPollCreation.mockReset();
    community.authorizeTextChannelPollVote.mockReset();
    const access = new PollMutationScopeAccess(
      communityRepository,
      conversationRepository,
    );

    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new PollMutationPolicy(access),
      new PollVoteMutationPolicy(access),
      new PollCloseMutationPolicy(access),
    ]);
  });

  it('admits a signed poll, ballot, tombstone and close from the right authors', async () => {
    await expect(
      gate.accepts('polls', await sign(poll, creator)),
    ).resolves.toBe(true);
    await expect(gate.accepts('polls', await sign(vote, voter))).resolves.toBe(
      true,
    );
    await expect(
      gate.accepts('polls', await sign(voteTombstone, voter)),
    ).resolves.toBe(true);
    await expect(
      gate.accepts('polls', await sign(close, creator)),
    ).resolves.toBe(true);
  });

  it('rejects unsigned records of every scope', async () => {
    for (const record of [poll, vote, voteTombstone, close]) {
      await expect(gate.accepts('polls', record)).resolves.toBe(false);
    }
  });

  it('rejects a poll signed by someone other than its creator', async () => {
    await expect(gate.accepts('polls', await sign(poll, voter))).resolves.toBe(
      false,
    );
  });

  it('rejects a ballot cast under another identity', async () => {
    await expect(
      gate.accepts('polls', await sign(vote, creator)),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('polls', await sign(voteTombstone, creator)),
    ).resolves.toBe(false);
  });

  it('rejects a ballot whose id is not derived from poll and voter', async () => {
    await expect(
      gate.accepts('polls', await sign({ ...vote, id: 'forged' }, voter)),
    ).resolves.toBe(false);
  });

  it('rejects a ballot with duplicate or no options', async () => {
    await expect(
      gate.accepts(
        'polls',
        await sign({ ...vote, optionIds: ['a', 'a'] }, voter),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('polls', await sign({ ...vote, optionIds: [] }, voter)),
    ).resolves.toBe(false);
  });

  it('rejects a poll with a single option or extra fields', async () => {
    await expect(
      gate.accepts(
        'polls',
        await sign({ ...poll, options: [{ id: 'a', text: 'A' }] }, creator),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('polls', await sign({ ...poll, status: 'open' }, creator)),
    ).resolves.toBe(false);
  });

  it('rejects a poll whose scope names both a channel and a conversation', async () => {
    await expect(
      gate.accepts(
        'polls',
        await sign({ ...poll, conversationId: 'group:1' }, creator),
      ),
    ).resolves.toBe(false);
  });

  it('rejects a poll or close the community does not let the author manage', async () => {
    community.authorizeTextChannelPollCreation.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(
      gate.accepts('polls', await sign(poll, creator)),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('polls', await sign(close, creator)),
    ).resolves.toBe(false);
  });

  it('rejects a ballot the community does not let the author cast, but admits its removal', async () => {
    community.authorizeTextChannelPollVote.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(gate.accepts('polls', await sign(vote, voter))).resolves.toBe(
      false,
    );
    await expect(
      gate.accepts('polls', await sign(voteTombstone, voter)),
    ).resolves.toBe(true);
  });

  it('admits group conversation polls only for participants of a group', async () => {
    const conversation = mock<Conversation>();
    const groupPoll = {
      allowsMultipleVotes: false,
      conversationId: 'group:1',
      createdAt,
      creatorIdentityId: creator,
      id: 'poll-2',
      options: poll.options,
      question: 'Which?',
      scopeType: 'poll',
    };

    conversationRepository.findMetadataById.mockResolvedValue(conversation);
    conversation.isGroup.mockReturnValue(true);
    conversation.hasParticipant.mockReturnValue(true);
    await expect(
      gate.accepts('polls', await sign(groupPoll, creator)),
    ).resolves.toBe(true);

    conversation.hasParticipant.mockReturnValue(false);
    await expect(
      gate.accepts(
        'polls',
        await sign({ ...groupPoll, id: 'poll-3' }, creator),
      ),
    ).resolves.toBe(false);
  });

  it('rejects records of an unknown community', async () => {
    communityRepository.findById.mockResolvedValue(undefined);

    await expect(
      gate.accepts('polls', await sign(poll, creator)),
    ).resolves.toBe(false);
  });
});

describe('PublicMutationGate over community channel messages', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const moderator =
    'MCowBQYDK2VwAyEA6q0J5o8mQm0h0v5x1o5J8W2b9GxX0m4mQn3r4Yl7k1c=';
  const id = `community:c1:ch1:m1:${author}`;
  const message = {
    authorIdentityId: author,
    channelId: 'ch1',
    communityId: 'c1',
    createdAt: 1780000000000,
    encryptedPayload: 'ciphertext',
    id,
    mentions: [] as unknown[],
    messageId: 'm1',
    scopeType: 'community_channel',
    type: 'sent',
  };
  const tombstone = {
    authorIdentityId: author,
    channelId: 'ch1',
    communityId: 'c1',
    id,
    messageId: 'm1',
    removed: true,
    scopeType: 'community_channel',
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  const community = mock<Community>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    kind: 'put' | 'delete',
    sequence: number,
    identityId = author,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId,
      },
      kind,
      operationId: `operation-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: sequence }),
      recordId: id,
      sequence,
      store: 'messages',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    jest.resetAllMocks();
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(community);
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityChannelMessageMutationPolicy(communityRepository),
    ]);
  });

  it('admits a signed message and its author deleting it', async () => {
    await expect(
      gate.accepts('messages', await sign(message, 'put', 1)),
    ).resolves.toBe(true);
    await expect(
      gate.accepts('messages', await sign(tombstone, 'delete', 2)),
    ).resolves.toBe(true);
  });

  it('admits a moderator tombstone only with the manage permission', async () => {
    await expect(
      gate.accepts('messages', await sign(tombstone, 'delete', 2, moderator)),
    ).resolves.toBe(true);
    expect(community.manageChannelMessages).toHaveBeenCalled();

    community.manageChannelMessages.mockImplementation(() => {
      throw new Error('forbidden');
    });
    await expect(
      gate.accepts('messages', await sign(tombstone, 'delete', 2, moderator)),
    ).resolves.toBe(false);
  });

  it('rejects unsigned, tampered and re-scoped messages', async () => {
    await expect(gate.accepts('messages', message)).resolves.toBe(false);

    const signed = await sign(message, 'put', 1);

    await expect(
      gate.accepts('messages', { ...signed, encryptedPayload: 'forged' }),
    ).resolves.toBe(false);
    await expect(
      gate.accepts('messages', {
        ...signed,
        channelId: 'ch2',
        id: `community:c1:ch2:m1:${author}`,
      }),
    ).resolves.toBe(false);
  });

  it('rejects a message signed by someone other than its author', async () => {
    await expect(
      gate.accepts('messages', await sign(message, 'put', 1, moderator)),
    ).resolves.toBe(false);
  });

  it('rejects a message the author may not send', async () => {
    community.acceptSentChannelMessage.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(
      gate.accepts('messages', await sign(message, 'put', 1)),
    ).resolves.toBe(false);
  });
});

describe('PublicMutationGate over community moderation logs', () => {
  const moderator =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const member = 'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=';
  const communityId = '550e8400-e29b-41d4-a716-446655440000';
  const createdAt = 1780000000000;
  const target = { id: member, type: 'member' };
  const id = CommunityModerationLogId.derive(
    communityId,
    moderator,
    'member_banned',
    target.type,
    target.id,
    createdAt,
  ).valueOf();
  const log = {
    action: 'member_banned',
    actorIdentityId: moderator,
    communityId,
    createdAt,
    details: { reason: 'spam' },
    id,
    scopeType: 'community_moderation_log',
    target,
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  const community = mock<Community>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    author: string,
    kind: 'put' | 'delete' = 'put',
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind,
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: 1 }),
      recordId: payload.id as string,
      sequence: 1,
      store: 'moderationLogs',
      version: 2,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(community);
    community.assertCanRecordModerationAction.mockReset();
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityModerationLogMutationPolicy(communityRepository as never),
    ]);
  });

  it('admits an entry signed by the permitted actor', async () => {
    await expect(
      gate.accepts('moderationLogs', await sign(log, moderator)),
    ).resolves.toBe(true);
    const [actor, action, details] =
      community.assertCanRecordModerationAction.mock.calls[0];

    expect([actor.valueOf(), action.valueOf(), details]).toEqual([
      expect.stringContaining(moderator),
      'member_banned',
      { reason: 'spam' },
    ]);
  });

  it('rejects an unsigned entry', async () => {
    await expect(gate.accepts('moderationLogs', log)).resolves.toBe(false);
  });

  it('rejects a forged tombstone of an entry, even signed by its actor', async () => {
    const tombstone = {
      action: log.action,
      actorIdentityId: moderator,
      communityId,
      id,
      removed: true,
      scopeType: 'community_moderation_log',
    };

    await expect(
      gate.accepts(
        'moderationLogs',
        await sign(tombstone, moderator, 'delete'),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'moderationLogs',
        await sign({ ...log, removed: true }, moderator, 'delete'),
      ),
    ).resolves.toBe(false);
  });

  it('rejects an entry signed by someone other than its actor', async () => {
    await expect(
      gate.accepts('moderationLogs', await sign(log, member)),
    ).resolves.toBe(false);
  });

  it('rejects an entry whose id is not derived from its signed fields', async () => {
    await expect(
      gate.accepts(
        'moderationLogs',
        await sign({ ...log, id: '123456789012345678901234' }, moderator),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'moderationLogs',
        await sign({ ...log, createdAt: createdAt + 1 }, moderator),
      ),
    ).resolves.toBe(false);
  });

  it('rejects a proof copied onto another entry', async () => {
    const signed = await sign(log, moderator);
    const copied = {
      ...signed,
      action: 'member_unbanned',
      id: CommunityModerationLogId.derive(
        communityId,
        moderator,
        'member_unbanned',
        target.type,
        target.id,
        createdAt,
      ).valueOf(),
    };

    await expect(gate.accepts('moderationLogs', copied)).resolves.toBe(false);
  });

  it('rejects an entry the actor has no permission to record', async () => {
    community.assertCanRecordModerationAction.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(
      gate.accepts('moderationLogs', await sign(log, moderator)),
    ).resolves.toBe(false);
  });

  it('rejects an entry with an unknown action or target type', async () => {
    await expect(
      gate.accepts(
        'moderationLogs',
        await sign({ ...log, action: 'made_up' }, moderator),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.accepts(
        'moderationLogs',
        await sign(
          { ...log, target: { id: member, type: 'galaxy' } },
          moderator,
        ),
      ),
    ).resolves.toBe(false);
  });

  it('rejects entries of an unknown community', async () => {
    communityRepository.findById.mockResolvedValue(undefined);

    await expect(
      gate.accepts('moderationLogs', await sign(log, moderator)),
    ).resolves.toBe(false);
  });
});
