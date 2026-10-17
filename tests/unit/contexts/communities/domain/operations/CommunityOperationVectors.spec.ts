import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import canonicalize from 'canonicalize';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

interface VectorKey {
  identityId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  seedHex: string;
}

interface VectorCase {
  derived: {
    digest: string;
    digestPreimage: string;
    identitySignature: string;
    identitySigningContent: string;
    mutation: Record<string, unknown>;
    mutationBody: Record<string, unknown>;
    payload: Record<string, unknown> & {
      id: string;
      identitySignature: string;
      parents: string[];
    };
    payloadCanonical: string;
    payloadDigest: string;
    recordId: string;
    requestOperation: {
      createdAt: number;
      identitySignature: string;
      mutation: Record<string, unknown>;
      parents: string[];
    };
    signature: string;
    signingContent: string;
  };
  input: {
    action: string;
    args: Record<string, unknown>;
    communityId: string;
    createdAt: number;
    networkId: string;
    operationId: string;
    parents: string[];
    signer: string;
  };
  name: string;
}

interface Vectors {
  cases: VectorCase[];
  communities: Record<
    string,
    { communityId: string; communityIdPreimage: string }
  >;
  keys: Record<string, VectorKey>;
  networkId: string;
}

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/community-operation.json'),
    'utf8',
  ),
) as Vectors;

/** The only hash the protocol uses: base64url(sha256(utf8(text))). */
function digestOfText(text: string): string {
  return createHash('sha256').update(text).digest('base64url');
}

describe('Community operation vectors', () => {
  it('derives each seed, key pair and identity id from the fixed label', () => {
    for (const [name, key] of Object.entries(vectors.keys)) {
      const seed = createHash('sha256')
        .update(`pigeon-vector:${name}`)
        .digest('hex');
      const der = Buffer.from(`302e020100300506032b657004220420${seed}`, 'hex');
      const privateKey = createPrivateKey(key.privateKeyPem);

      expect(key.seedHex).toBe(seed);
      expect(key.privateKeyPem).toBe(
        `-----BEGIN PRIVATE KEY-----\n${der.toString('base64')}\n-----END PRIVATE KEY-----\n`,
      );
      expect(
        createPublicKey(privateKey)
          .export({ format: 'pem', type: 'spki' })
          .toString(),
      ).toBe(key.publicKeyPem);
      expect(new IdentityId(key.publicKeyPem).valueOf()).toBe(key.identityId);
    }
  });

  it('derives every community id from the network, the nonce and the owner', () => {
    const owner = vectors.keys.owner.identityId;

    for (const community of Object.values(vectors.communities)) {
      const { nonce } = JSON.parse(community.communityIdPreimage) as {
        nonce: string;
      };

      expect(
        canonicalize({
          networkId: vectors.networkId,
          nonce,
          ownerIdentityId: owner,
        }),
      ).toBe(community.communityIdPreimage);
      expect(digestOfText(community.communityIdPreimage)).toBe(
        community.communityId,
      );
      expect(
        CommunityId.derive(vectors.networkId, owner, nonce).valueOf(),
      ).toBe(community.communityId);
    }
  });

  it('chains the invitation, its admission and a later join to the earlier digests', () => {
    const byName = Object.fromEntries(
      vectors.cases.map((vector) => [vector.name, vector]),
    );
    const genesis = byName.genesis.derived.digest;
    const created = byName.invitation_created.derived.digest;
    const admitted = byName.member_joined_invitation.derived.digest;

    expect(byName.invitation_created.derived.payload.parents).toEqual([
      genesis,
    ]);
    expect(byName.member_joined_invitation.derived.payload.parents).toEqual([
      created,
    ]);
    expect(byName.member_joined_invitation.input.args.invitationId).toBe(
      created,
    );
    expect(
      byName.member_joined_added_two_parents.derived.payload.parents,
    ).toEqual([genesis, admitted].sort());
    expect(byName.member_joined_added_two_parents.input.parents).toEqual(
      [genesis, admitted].sort().reverse(),
    );
  });

  it('folds the chain into a community that admitted the invitee once', () => {
    const chain = [
      'genesis',
      'invitation_created',
      'member_joined_invitation',
      'member_joined_added_two_parents',
    ].map((name) =>
      CommunityOperation.fromPrimitives(
        vectors.cases.find((vector) => vector.name === name)!.derived.payload,
      ),
    );
    const state = CommunityStateFold.fold(chain);
    const created = chain[1].getHash();

    expect(state.skipped).toEqual([]);
    expect(
      state.community
        ?.getMemberIds()
        .map((id) => id.valueOf())
        .sort(),
    ).toEqual(
      [vectors.keys.member, vectors.keys.other, vectors.keys.owner]
        .map(({ identityId }) => identityId)
        .sort(),
    );
    expect(state.invitations.find(created)?.getInvitationKey()).toBe(
      chain[1].toPrimitives().args.invitationKey,
    );
    expect(
      state.invitations
        .find(created)
        ?.hasJoined(new IdentityId(vectors.keys.member.identityId)),
    ).toBe(true);
  });

  describe.each(vectors.cases)('$name', (vector) => {
    const { derived, input } = vector;
    const signer = vectors.keys[input.signer];

    it('recomputes digests and signing content from the canonical JSON alone', () => {
      const { id, identitySignature, ...content } = derived.payload;
      const digest = digestOfText(canonicalize(content) as string);

      expect(canonicalize(content)).toBe(derived.digestPreimage);
      expect(digest).toBe(derived.digest);
      expect(id).toBe(`community:${input.communityId}:op:${digest}`);
      expect(derived.recordId).toBe(id);
      expect(derived.identitySigningContent).toBe(
        `pigeon:community-operation:v1\n${id}`,
      );
      expect(identitySignature).toBe(derived.identitySignature);
      expect(canonicalize(derived.payload)).toBe(derived.payloadCanonical);
      expect(digestOfText(derived.payloadCanonical)).toBe(
        derived.payloadDigest,
      );
      expect(derived.mutationBody).toEqual({
        author: {
          authorizationRevision: 0,
          deviceCredential: signer.identityId,
          identityId: signer.identityId,
        },
        kind: 'put',
        operationId: input.operationId,
        payloadDigest: derived.payloadDigest,
        predecessor: null,
        recordId: derived.recordId,
        sequence: 0,
        store: 'communityOperations',
        version: 2,
      });
      expect(derived.signingContent).toBe(
        `pigeon:public-mutation:v2\n${canonicalize(derived.mutationBody)}`,
      );
      expect(derived.mutation).toEqual({
        ...derived.mutationBody,
        signature: derived.signature,
      });
      expect(derived.requestOperation).toEqual({
        createdAt: input.createdAt,
        identitySignature: derived.identitySignature,
        mutation: derived.mutation,
        parents: derived.payload.parents,
      });
    });

    it('signs with the fixed key to the fixed signatures', () => {
      const privateKey = createPrivateKey(signer.privateKeyPem);
      const publicKey = createPublicKey(signer.publicKeyPem);

      for (const [content, signature] of [
        [derived.signingContent, derived.signature],
        [derived.identitySigningContent, derived.identitySignature],
      ]) {
        expect(
          sign(null, Buffer.from(content), privateKey).toString('base64'),
        ).toBe(signature);
        expect(
          verify(
            null,
            Buffer.from(content),
            publicKey,
            Buffer.from(signature, 'base64'),
          ),
        ).toBe(true);
      }
    });

    it('is rebuilt byte for byte by the domain code from the inputs', () => {
      const operation = CommunityOperation.create({
        action: new CommunityOperationAction(input.action),
        args: input.args,
        authorIdentityId: new IdentityId(signer.identityId),
        communityId: new CommunityId(input.communityId),
        createdAt: input.createdAt,
        identitySignature: derived.identitySignature,
        networkId: new NetworkId(input.networkId),
        parents: input.parents,
      });

      expect(() => operation.assertIdentitySigned()).not.toThrow();
      expect(operation.getId()).toBe(derived.recordId);
      expect(operation.toPrimitives()).toEqual(derived.payload);
      expect(operation.getHash()).toBe(derived.digest);
      expect(
        CommunityOperation.identitySigningContentOf(operation.getId()),
      ).toBe(derived.identitySigningContent);
      expect(PublicMutationProof.digestOf(operation.toPrimitives())).toBe(
        derived.payloadDigest,
      );
      expect(
        PublicMutationProof.signingContentOf(derived.mutationBody as never),
      ).toBe(derived.signingContent);
    });

    it('is accepted by the strict operation and proof decoders', () => {
      expect(CommunityOperation.fromPrimitives(derived.payload).getHash()).toBe(
        derived.digest,
      );
      expect(
        PublicMutationProof.fromPrimitives(derived.mutation).toPrimitives(),
      ).toEqual(derived.mutation);
    });
  });
});
