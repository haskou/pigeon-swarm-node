import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';

const identityKeys = new Map<string, PrivateKey>();

/** Fixed keys keep digests, and so the fold's total order, stable across runs. */
function identity(privateKey: string): IdentityId {
  const key = PrivateKey.fromPEM(
    `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`,
  );
  const identityId = new IdentityId(key.getPublicKey().toString());

  identityKeys.set(identityId.valueOf(), key);

  return identityId;
}

export const owner = identity(
  'MC4CAQAwBQYDK2VwBCIEIDIImzhDl2dxpc8sBEBMfgC0+uf+4utMsT5+/RVYec3h',
);
export const alice = identity(
  'MC4CAQAwBQYDK2VwBCIEIF9cDZsclQzu6BGMlKg+dN1sHTrS13KTPWYY0361oXRt',
);
export const mallory = identity(
  'MC4CAQAwBQYDK2VwBCIEICnuu9V2LeqLwzcMTZQ+dYb9xsWLWISe3XwTPFQMT5R2',
);
export const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
export const nonce = 'genesis-nonce';
export const communityId = CommunityId.derive(
  networkId.valueOf(),
  owner.valueOf(),
  nonce,
);

/** Signs `id` the way `author`'s identity key signs its community operations. */
export function identitySignatureOf(author: IdentityId, id: string): string {
  const key = identityKeys.get(author.valueOf());

  if (!key) throw new Error(`No identity key for ${author.valueOf()}`);

  return key.sign(CommunityOperation.identitySigningContentOf(id)).toString();
}

/** A well-formed identity signature over no operation, for use cases whose store and gate are mocked. */
export const unverifiedIdentitySignature = PrivateKey.generate()
  .sign('unverified')
  .toString();

export function operation(
  action: CommunityOperationAction,
  author: IdentityId,
  args: Record<string, unknown>,
  parents: CommunityOperation[],
  createdAt = 1,
): CommunityOperation {
  const attributes = {
    action,
    args,
    authorIdentityId: author,
    communityId,
    createdAt,
    networkId,
    parents: parents.map((parent) => parent.getHash()),
  };

  return CommunityOperation.create({
    ...attributes,
    identitySignature: identitySignatureOf(
      author,
      CommunityOperation.recordIdFor(attributes),
    ),
  });
}

export function genesis(autoJoinEnabled = false): CommunityOperation {
  return operation(
    CommunityOperationAction.COMMUNITY_CREATED,
    owner,
    {
      autoJoinEnabled,
      description: 'A community',
      discoverable: true,
      name: 'Community',
      nonce,
      visibility: 'public',
    },
    [],
  );
}

export function join(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_JOINED,
    author,
    { identityId: member.valueOf(), method: 'added' },
    parents,
  );
}

export function ban(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_BANNED,
    author,
    { identityId: member.valueOf() },
    parents,
  );
}
