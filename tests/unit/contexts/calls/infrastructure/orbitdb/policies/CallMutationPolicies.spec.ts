import CallEndMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallEndMutationPolicy';
import CallParticipantMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallParticipantMutationPolicy';
import CallStartMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallStartMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import {
  CallRecordPayload,
  endPayload,
  newCallSigner,
  participantPayload,
  startPayload,
} from '../../../../../../support/signCall';

const NETWORK = '550e8400-e29b-41d4-a716-446655440002';
const CONVERSATION = 'one-to-one:policy-spec';
const NONCE = 'policy-spec-nonce-0001';

describe('call mutation policies', () => {
  let alice: string;
  let bob: string;
  let carol: string;
  let docs: Record<string, unknown>[];
  let registry: OrbitDBReplicatedStateRegistry;
  let conversation: Record<string, unknown>;
  let voiceAllowed: boolean;
  let startPolicy: CallStartMutationPolicy;
  let participantPolicy: CallParticipantMutationPolicy;
  let endPolicy: CallEndMutationPolicy;

  const now = () => Date.now();
  const clone = (payload: CallRecordPayload, extra: object = {}) => ({
    ...payload,
    ...extra,
  });

  beforeAll(async () => {
    alice = (await newCallSigner()).id;
    bob = (await newCallSigner()).id;
    carol = (await newCallSigner()).id;
  });

  beforeEach(() => {
    docs = [];
    voiceAllowed = true;
    conversation = {
      getNetworkId: () => ({ valueOf: () => NETWORK }),
      getParticipantIds: () =>
        [alice, bob].map((id) => ({ valueOf: () => id })),
      isGroup: () => false,
    };
    registry = {
      queryDocuments: jest.fn(
        (_s: string, m: (d: Record<string, unknown>) => boolean) =>
          Promise.resolve(docs.filter(m)),
      ),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const community = {
      authorizeVoiceChannelCall: () => {
        if (!voiceAllowed) throw new Error('forbidden');
      },
      getNetworkId: () => ({ valueOf: () => NETWORK }),
    };

    startPolicy = new CallStartMutationPolicy(
      registry,
      { findMetadataById: jest.fn(async () => conversation) } as never,
      { findById: jest.fn(async () => community) } as never,
    );
    participantPolicy = new CallParticipantMutationPolicy(registry, {
      findById: jest.fn(async () => community),
    } as never);
    endPolicy = new CallEndMutationPolicy(registry);
  });

  const conversationStart = (extra: object = {}, creator = alice) =>
    clone(
      startPayload({
        networkId: NETWORK,
        nonce: NONCE,
        participantIds: [alice, bob],
        scope: { conversationId: CONVERSATION, type: 'conversation' },
        signer: { id: creator } as never,
        startedAt: now(),
      }),
      extra,
    );

  const communityStart = (sessionEpoch = 1, extra: object = {}) =>
    clone(
      startPayload({
        networkId: NETWORK,
        nonce: NONCE,
        scope: {
          channelId: 'channel-1',
          communityId: 'community-1',
          type: 'community_channel',
        },
        sessionEpoch,
        signer: { id: alice } as never,
        startedAt: now(),
      }),
      extra,
    );

  describe('CallStartMutationPolicy', () => {
    it('expects the creator as author of a conversation start', () => {
      const record = conversationStart();

      expect(startPolicy.expectationOf(record)).toEqual({
        authorIdentityId: alice,
        recordId: record.id,
        store: 'calls',
      });
    });

    it.each([
      ['callId not derived from creator and nonce', { callId: 'x'.repeat(36) }],
      ['record id mismatch', { id: 'call:other' }],
      ['removed marker', { removed: true }],
      ['future start', { startedAt: Date.now() + 3_600_000 }],
      ['conversation sessionEpoch', { sessionEpoch: 1 }],
      ['empty conversation participants', { participantIds: [] }],
      [
        'extra scope key',
        {
          scope: {
            channelId: 'c',
            conversationId: CONVERSATION,
            type: 'conversation',
          },
        },
      ],
      ['unknown scope type', { scope: { type: 'other' } }],
      ['unknown field', { surprise: 1 }],
    ])('rejects %s', (_name, extra) => {
      expect(() => startPolicy.expectationOf(conversationStart(extra))).toThrow(
        InvalidPublicMutationError,
      );
    });

    it.each([
      ['no sessionEpoch', { sessionEpoch: undefined }],
      ['sessionEpoch zero', { sessionEpoch: 0 }],
      ['non-empty participants', { participantIds: [alice] }],
    ])('rejects a community start with %s', (_name, extra) => {
      expect(() => startPolicy.expectationOf(communityStart(1, extra))).toThrow(
        InvalidPublicMutationError,
      );
    });

    it('admits a start by a participant with exactly the admitted participants', async () => {
      await expect(
        startPolicy.assertPermitted(conversationStart(), alice, false),
      ).resolves.toBeUndefined();
    });

    it.each([
      [
        'an author who is not the creator',
        () => conversationStart(),
        () => bob,
        false,
      ],
      ['a deletion', () => conversationStart(), () => alice, true],
      [
        'an extra participant',
        () => conversationStart({ participantIds: [alice, bob, carol] }),
        () => alice,
        false,
      ],
      [
        'a missing participant',
        () => conversationStart({ participantIds: [alice] }),
        () => alice,
        false,
      ],
      [
        'another network',
        () => conversationStart({ networkId: 'other-network' }),
        () => alice,
        false,
      ],
    ])('rejects %s', async (_name, record, author, deletion) => {
      await expect(
        startPolicy.assertPermitted(record(), author(), deletion),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('rejects a creator outside the conversation', async () => {
      await expect(
        startPolicy.assertPermitted(conversationStart({}, carol), carol, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('rejects a start in an unknown conversation', async () => {
      conversation = undefined as never;

      await expect(
        startPolicy.assertPermitted(conversationStart(), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('rejects a one-to-one start of a three-member conversation', async () => {
      conversation.getParticipantIds = () =>
        [alice, bob, carol].map((id) => ({ valueOf: () => id }));

      await expect(
        startPolicy.assertPermitted(
          conversationStart({ participantIds: [alice, bob, carol] }),
          alice,
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('admits a community start the community lets the creator connect to', async () => {
      await expect(
        startPolicy.assertPermitted(communityStart(1), alice, false),
      ).resolves.toBeUndefined();
    });

    it('rejects a community start the creator may not connect to', async () => {
      voiceAllowed = false;

      await expect(
        startPolicy.assertPermitted(communityStart(1), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('bounds sessionEpoch to the known maximum of the channel plus one', async () => {
      docs.push({
        id: 'call:other',
        scope: { channelId: 'channel-1', communityId: 'community-1' },
        scopeType: 'call_start',
        sessionEpoch: 4,
      });

      await expect(
        startPolicy.assertPermitted(communityStart(5), alice, false),
      ).resolves.toBeUndefined();
      await expect(
        startPolicy.assertPermitted(communityStart(6), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
      await expect(
        startPolicy.assertPermitted(communityStart(1_000_000), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('ignores the epochs of other channels when bounding sessionEpoch', async () => {
      docs.push({
        id: 'call:other',
        scope: { channelId: 'channel-2', communityId: 'community-1' },
        scopeType: 'call_start',
        sessionEpoch: 50,
      });

      await expect(
        startPolicy.assertPermitted(communityStart(2), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });
  });

  describe('CallParticipantMutationPolicy', () => {
    const start = () => conversationStart();
    const joined = (identity = bob, extra: object = {}) =>
      clone(
        participantPayload({
          at: now(),
          callId: start().callId as string,
          identityId: identity,
          state: 'joined',
        }),
        extra,
      );

    it('expects the identity itself as author', () => {
      const record = joined();

      expect(participantPolicy.expectationOf(record)).toEqual({
        authorIdentityId: bob,
        recordId: record.id,
        store: 'calls',
      });
    });

    it.each([
      ['unknown state', { state: 'weird' }],
      ['id mismatch', { id: 'call-participant:x:y' }],
      ['removed marker', { removed: true }],
      ['future time', { at: Date.now() + 3_600_000 }],
    ])('rejects %s', (_name, extra) => {
      expect(() => participantPolicy.expectationOf(joined(bob, extra))).toThrow(
        InvalidPublicMutationError,
      );
    });

    it('admits a conversation participant once the start is admitted', async () => {
      docs.push(start());

      await expect(
        participantPolicy.assertPermitted(joined(), bob, false),
      ).resolves.toBeUndefined();
    });

    it('rejects a participant record without an admitted start', async () => {
      await expect(
        participantPolicy.assertPermitted(joined(), bob, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('rejects an author who is not the identity, and deletions', async () => {
      docs.push(start());

      await expect(
        participantPolicy.assertPermitted(joined(), alice, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
      await expect(
        participantPolicy.assertPermitted(joined(), bob, true),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('rejects an identity outside the conversation call', async () => {
      docs.push(start());

      await expect(
        participantPolicy.assertPermitted(joined(carol), carol, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('applies the community voice rule to community calls', async () => {
      const community = communityStart(1);
      docs.push(community);
      const record = clone(
        participantPayload({
          at: now(),
          callId: community.callId as string,
          identityId: carol,
          state: 'joined',
        }),
      );

      await expect(
        participantPolicy.assertPermitted(record, carol, false),
      ).resolves.toBeUndefined();
      voiceAllowed = false;
      await expect(
        participantPolicy.assertPermitted(record, carol, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });
  });

  describe('CallEndMutationPolicy', () => {
    const end = (by: string, callId: string, extra: object = {}) =>
      clone(endPayload({ at: now(), callId, endedByIdentityId: by }), extra);

    it('expects the ending identity as author', () => {
      const record = end(alice, conversationStart().callId as string);

      expect(endPolicy.expectationOf(record)).toEqual({
        authorIdentityId: alice,
        recordId: record.id,
        store: 'calls',
      });
    });

    it.each([
      ['id mismatch', { id: 'call-end:other' }],
      ['removed marker', { removed: true }],
      ['future time', { at: Date.now() + 3_600_000 }],
    ])('rejects %s', (_name, extra) => {
      expect(() =>
        endPolicy.expectationOf(
          end(alice, conversationStart().callId as string, extra),
        ),
      ).toThrow(InvalidPublicMutationError);
    });

    it('lets the creator and any conversation participant end a conversation call', async () => {
      const start = conversationStart();
      docs.push(start);

      await expect(
        endPolicy.assertPermitted(
          end(alice, start.callId as string),
          alice,
          false,
        ),
      ).resolves.toBeUndefined();
      await expect(
        endPolicy.assertPermitted(end(bob, start.callId as string), bob, false),
      ).resolves.toBeUndefined();
    });

    it('rejects an outsider, a spoofed author, a deletion and a missing start', async () => {
      const start = conversationStart();

      await expect(
        endPolicy.assertPermitted(
          end(alice, start.callId as string),
          alice,
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
      docs.push(start);
      await expect(
        endPolicy.assertPermitted(
          end(carol, start.callId as string),
          carol,
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
      await expect(
        endPolicy.assertPermitted(
          end(alice, start.callId as string),
          bob,
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
      await expect(
        endPolicy.assertPermitted(
          end(alice, start.callId as string),
          alice,
          true,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('lets only the creator end a community call', async () => {
      const start = communityStart(1);
      docs.push(start);

      await expect(
        endPolicy.assertPermitted(
          end(alice, start.callId as string),
          alice,
          false,
        ),
      ).resolves.toBeUndefined();
      await expect(
        endPolicy.assertPermitted(end(bob, start.callId as string), bob, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });
  });
});
