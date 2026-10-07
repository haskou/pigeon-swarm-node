import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
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
import { join } from 'node:path';

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
    mutation: Record<string, unknown>;
    mutationBody: Record<string, unknown>;
    payload: Record<string, unknown> & {
      id: string;
      parents: string[];
    };
    payloadCanonical: string;
    payloadDigest: string;
    recordId: string;
    requestOperation: {
      createdAt: number;
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
  inviteToken: {
    communityId: string;
    creatorIdentityId: string;
    nonce: string;
    token: string;
  };
  keys: Record<string, VectorKey>;
  networkId: string;
}

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../fixtures/community-operation-vectors.json'),
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

  it('derives the invite token used as the invite_link reference', () => {
    const { communityId, creatorIdentityId, nonce, token } =
      vectors.inviteToken;

    expect(
      digestOfText(JSON.stringify([communityId, creatorIdentityId, nonce])),
    ).toBe(token);
    expect(
      CommunityInviteToken.derive(
        communityId,
        creatorIdentityId,
        nonce,
      ).valueOf(),
    ).toBe(token);
    expect(
      vectors.cases.find(({ name }) => name === 'member_joined_invite_link')
        ?.input.args.reference,
    ).toBe(token);
  });

  it('chains the parents of each member_joined to the earlier digests', () => {
    const [genesis, , joined, added] = vectors.cases;

    expect(joined.derived.payload.parents).toEqual([genesis.derived.digest]);
    expect(added.derived.payload.parents).toEqual(
      [genesis.derived.digest, joined.derived.digest].sort(),
    );
    expect(added.input.parents).toEqual(
      [genesis.derived.digest, joined.derived.digest].sort().reverse(),
    );
  });

  describe.each(vectors.cases)('$name', (vector) => {
    const { derived, input } = vector;
    const signer = vectors.keys[input.signer];

    it('recomputes digests and signing content from the canonical JSON alone', () => {
      const { id, ...content } = derived.payload;
      const digest = digestOfText(canonicalize(content) as string);

      expect(canonicalize(content)).toBe(derived.digestPreimage);
      expect(digest).toBe(derived.digest);
      expect(id).toBe(`community:${input.communityId}:op:${digest}`);
      expect(derived.recordId).toBe(id);
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
        `pigeon:public-mutation:v1\n${canonicalize(derived.mutationBody)}`,
      );
      expect(derived.mutation).toEqual({
        ...derived.mutationBody,
        signature: derived.signature,
      });
      expect(derived.requestOperation).toEqual({
        createdAt: input.createdAt,
        mutation: derived.mutation,
        parents: derived.payload.parents,
      });
    });

    it('signs with the fixed key to the fixed signature', () => {
      const content = Buffer.from(derived.signingContent);

      expect(
        sign(null, content, createPrivateKey(signer.privateKeyPem)).toString(
          'base64',
        ),
      ).toBe(derived.signature);
      expect(
        verify(
          null,
          content,
          createPublicKey(signer.publicKeyPem),
          Buffer.from(derived.signature, 'base64'),
        ),
      ).toBe(true);
    });

    it('is rebuilt byte for byte by the domain code from the inputs', () => {
      const operation = CommunityOperation.create({
        action: new CommunityOperationAction(input.action),
        args: input.args,
        authorIdentityId: new IdentityId(signer.identityId),
        communityId: new CommunityId(input.communityId),
        createdAt: input.createdAt,
        networkId: new NetworkId(input.networkId),
        parents: input.parents,
      });

      expect(operation.toPrimitives()).toEqual(derived.payload);
      expect(operation.getHash()).toBe(derived.digest);
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
