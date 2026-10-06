import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
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
    conversationId: string;
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
  conversations: Record<
    string,
    { conversationId: string; conversationIdPreimage: string; nonce?: string }
  >;
  keys: Record<string, VectorKey>;
  networkId: string;
}

const vectors = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../../fixtures/conversation-operation-vectors.json',
    ),
    'utf8',
  ),
) as Vectors;

/** The only hash the protocol uses: base64url(sha256(utf8(text))). */
function digestOfText(text: string): string {
  return createHash('sha256').update(text).digest('base64url');
}

describe('Conversation operation vectors', () => {
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

  it('derives every group id from the network, the creator and the nonce', () => {
    const creator = vectors.keys.creator.identityId;

    for (const name of ['group', 'group_unicode']) {
      const conversation = vectors.conversations[name];
      const nonce = conversation.nonce as string;

      expect(
        canonicalize({
          creatorIdentityId: creator,
          networkId: vectors.networkId,
          nonce,
        }),
      ).toBe(conversation.conversationIdPreimage);
      expect(`group:${digestOfText(conversation.conversationIdPreimage)}`).toBe(
        conversation.conversationId,
      );
      expect(
        ConversationId.deriveGroup(vectors.networkId, creator, nonce).valueOf(),
      ).toBe(conversation.conversationId);
    }
  });

  it('derives the one-to-one id from the two sorted identity ids and the network', () => {
    const conversation = vectors.conversations.one_to_one;
    const [first, second] = [
      vectors.keys.creator.identityId,
      vectors.keys.member.identityId,
    ].sort();

    expect(conversation.conversationIdPreimage).toBe(
      `${first}:${second}:${vectors.networkId}`,
    );
    expect(
      `one-to-one:${createHash('sha256').update(conversation.conversationIdPreimage).digest('hex')}`,
    ).toBe(conversation.conversationId);
    expect(
      ConversationId.deterministic(
        vectors.keys.member.identityId,
        vectors.keys.creator.identityId,
        vectors.networkId,
      ).valueOf(),
    ).toBe(conversation.conversationId);
  });

  it('folds the signed group operations to the expected roster', () => {
    const { group } = vectors.conversations;
    const operations = vectors.cases
      .filter(({ input }) => input.conversationId === group.conversationId)
      .map(({ derived }) =>
        ConversationOperation.fromPrimitives(derived.payload),
      );
    const state = ConversationStateFold.fold(operations);
    const { admin, creator } = vectors.keys;

    expect(state.skipped).toEqual([]);
    expect(state.roster?.getCreator()).toBe(creator.identityId);
    expect(state.roster?.getMembers()).toEqual([creator.identityId]);
    expect(state.roster?.getAdmins()).toEqual([]);
    expect(state.roster?.isMember(admin.identityId)).toBe(false);
  });

  describe.each(vectors.cases)('$name', (vector) => {
    const { derived, input } = vector;
    const signer = vectors.keys[input.signer];

    it('recomputes digests and signing content from the canonical JSON alone', () => {
      const { id, ...content } = derived.payload;
      const digest = digestOfText(canonicalize(content) as string);

      expect(canonicalize(content)).toBe(derived.digestPreimage);
      expect(digest).toBe(derived.digest);
      expect(id).toBe(`conversation:${input.conversationId}:op:${digest}`);
      expect(derived.recordId).toBe(id);
      expect(canonicalize(derived.payload)).toBe(derived.payloadCanonical);
      expect(digestOfText(derived.payloadCanonical)).toBe(
        derived.payloadDigest,
      );
      expect(derived.mutationBody).toEqual({
        author: {
          deviceCredential: signer.identityId,
          identityId: signer.identityId,
        },
        kind: 'put',
        operationId: input.operationId,
        payloadDigest: derived.payloadDigest,
        predecessor: null,
        recordId: derived.recordId,
        sequence: 0,
        store: 'conversationOperations',
        version: 1,
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
      const operation = ConversationOperation.create({
        action: new ConversationOperationAction(input.action),
        args: input.args,
        authorIdentityId: new IdentityId(signer.identityId),
        conversationId: new ConversationId(input.conversationId),
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
      expect(
        ConversationOperation.fromPrimitives(derived.payload).getHash(),
      ).toBe(derived.digest);
      expect(
        PublicMutationProof.fromPrimitives(derived.mutation).toPrimitives(),
      ).toEqual(derived.mutation);
    });
  });
});
