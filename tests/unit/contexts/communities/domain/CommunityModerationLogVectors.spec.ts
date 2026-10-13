import { CommunityModerationLogMutation } from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogMutation';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import CommunityModerationLogMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityModerationLogMutationPolicy';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Vectors {
  cases: {
    derived: {
      body: { createdAt: number; mutation: Record<string, unknown> };
      id: string;
      idPreimage: string;
      mutationBody: Record<string, unknown> & { frontier: string[] };
      payload: Record<string, unknown>;
      payloadCanonical: string;
      payloadDigest: string;
      signature: string;
      signingContent: string;
    };
    input: {
      action: string;
      communityId: string;
      createdAt: number;
      details: Record<string, unknown>;
      target: { id: string; type: string };
    };
    name: string;
  }[];
  keys: Record<string, { identityId: string; publicKeyPem: string }>;
}

const vectors = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../fixtures/community-moderation-log-vectors.json',
    ),
    'utf8',
  ),
) as Vectors;
const cases = vectors.cases.map((vector) => [vector.name, vector] as const);
const actor = vectors.keys.moderator.identityId;

describe('Community moderation log vectors', () => {
  const community = {
    assertCanRecordModerationAction: jest.fn(),
  } as unknown as Community;
  const communityRepository = {
    requireAtFrontier: jest.fn(() => Promise.resolve(community)),
  } as unknown as OrbitDBCommunityRepository;
  const policy = new CommunityModerationLogMutationPolicy(communityRepository);
  const gate = new PublicMutationGate(
    new PublicMutationVerifier({ isAuthorized: () => Promise.resolve(true) }),
    [policy],
  );
  /** The record exactly as the node stores and replicates it. */
  const storedRecord = (
    vector: Vectors['cases'][number],
  ): Record<string, unknown> => {
    const { input } = vector;
    const entry = CommunityModerationLogEntry.create(
      new CommunityId(input.communityId),
      new IdentityId(actor),
      new CommunityModerationAction(input.action),
      CommunityModerationTarget.fromPrimitives(input.target),
      new CommunityModerationLogDetails(input.details),
      new Timestamp(input.createdAt),
    );

    return PublicMutationRecord.withProof(
      { ...entry.toPrimitives(), scopeType: 'community_moderation_log' },
      new CommunityModerationLogMutation(vector.derived.body).proof,
    );
  };

  it.each(cases)('%s derives the log id', (_name, vector) => {
    const { input } = vector;

    expect(
      JSON.stringify([
        input.communityId,
        actor,
        input.action,
        input.target.type,
        input.target.id,
        input.createdAt,
      ]),
    ).toBe(vector.derived.idPreimage);
    expect(
      createHash('sha256')
        .update(vector.derived.idPreimage)
        .digest('hex')
        .slice(0, 24),
    ).toBe(vector.derived.id);
    expect(
      CommunityModerationLogId.derive(
        input.communityId,
        actor,
        input.action,
        input.target.type,
        input.target.id,
        input.createdAt,
      ).valueOf(),
    ).toBe(vector.derived.id);
  });

  it.each(cases)('%s is byte exact', (_name, vector) => {
    const { derived } = vector;
    const proof = new CommunityModerationLogMutation(derived.body).proof;

    expect(PublicMutationRecord.payloadOf(storedRecord(vector))).toEqual(
      derived.payload,
    );
    expect(canonicalize(derived.payload)).toBe(derived.payloadCanonical);
    expect(PublicMutationProof.digestOf(derived.payload)).toBe(
      derived.payloadDigest,
    );
    expect(proof.signingContent()).toBe(derived.signingContent);
    expect(proof.toPrimitives()).toEqual(derived.body.mutation);
    expect(derived.body.mutation).toEqual({
      ...derived.mutationBody,
      signature: derived.signature,
    });
    expect(
      verify(
        null,
        Buffer.from(derived.signingContent),
        createPublicKey(vectors.keys.moderator.publicKeyPem),
        Buffer.from(derived.signature, 'base64'),
      ),
    ).toBe(true);
  });

  it.each(cases)(
    '%s is admitted by the moderationLogs gate',
    async (_name, vector) => {
      await expect(
        gate.accepts('moderationLogs', storedRecord(vector)),
      ).resolves.toBe(true);
      expect(communityRepository.requireAtFrontier).toHaveBeenCalledWith(
        new CommunityId(vector.input.communityId),
        vector.derived.mutationBody.frontier,
      );
    },
  );

  it.each(cases)(
    '%s is refused once a signed field changes',
    async (_name, vector) => {
      const record = storedRecord(vector);

      await expect(
        gate.accepts('moderationLogs', {
          ...record,
          details: { ...vector.input.details, forged: true },
        }),
      ).resolves.toBe(false);
      await expect(
        gate.accepts('moderationLogs', {
          ...record,
          id: CommunityModerationLogId.derive(
            vector.input.communityId,
            actor,
            vector.input.action,
            vector.input.target.type,
            vector.input.target.id,
            vector.input.createdAt + 1,
          ).valueOf(),
        }),
      ).resolves.toBe(false);
    },
  );
});
