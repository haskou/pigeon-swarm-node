import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  CommunityInvitationConsent,
  CommunityInvitationFields,
  CommunityInvitationKey,
  PrivateKey,
} from '@haskou/pigeon-swarm-crypto';
import { createHash } from 'crypto';

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
export const bob = identity(
  'MC4CAQAwBQYDK2VwBCIEIITcclmMZO5EOvJgals66/BqdvwRYWgjluAURd77+vzX',
);
export const carol = identity(
  'MC4CAQAwBQYDK2VwBCIEIJ8NerH16sGVBElIpS2h9DxE3RDRmaHrh/BOFBb5OJ0x',
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

/** The identity key behind a fixture identity. */
export function privateKeyOf(identityId: IdentityId): PrivateKey {
  const key = identityKeys.get(identityId.valueOf());

  if (!key) throw new Error(`No identity key for ${identityId.valueOf()}`);

  return key;
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

export function kick(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
  createdAt = 1,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_KICKED,
    author,
    { identityId: member.valueOf() },
    parents,
    createdAt,
  );
}

export function leave(
  parents: CommunityOperation[],
  member: IdentityId,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_LEFT,
    member,
    { identityId: member.valueOf() },
    parents,
  );
}

/** A role holding `permissions`, created by `author` at `createdAt`. */
export function role(
  parents: CommunityOperation[],
  permissions: string[],
  createdAt = 1,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.ROLE_CREATED,
    author,
    {
      name: `role-${createdAt}`,
      permissions,
      roleId: CommunityRoleId.derive(
        communityId.valueOf(),
        author.valueOf(),
        createdAt,
      ).valueOf(),
    },
    parents,
    createdAt,
  );
}

export function assignRoles(
  parents: CommunityOperation[],
  member: IdentityId,
  roles: CommunityOperation[],
  author = owner,
  createdAt = 1,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_ROLES_UPDATED,
    author,
    {
      identityId: member.valueOf(),
      roleIds: roles.map((created) => String(created.getArguments().roleId)),
    },
    parents,
    createdAt,
  );
}

export const DAY = 86_400_000;

export type Invitation = {
  key: CommunityInvitationKey;
  operation: CommunityOperation;
};

/**
 * An `invitation_created` valid for 7 days and 5 uses unless `args` says
 * otherwise. The key comes from `label`, so digests stay stable and two
 * invitations share a key only when they share a label.
 */
export function invitation(
  parents: CommunityOperation[],
  author = owner,
  args: Record<string, unknown> = {},
  createdAt = 1,
  label = `invitation:${author.valueOf()}:${createdAt}`,
): Invitation {
  const key = CommunityInvitationKey.fromSecret(
    createHash('sha256').update(label).digest('base64url'),
  );

  return {
    key,
    operation: operation(
      CommunityOperationAction.INVITATION_CREATED,
      author,
      {
        expiresAt: createdAt + 7 * DAY,
        invitationKey: key.publicKey(),
        maxUses: 5,
        ...args,
      },
      parents,
      createdAt,
    ),
  };
}

export function invitationFieldsOf(
  invited: CommunityOperation,
  joiner: IdentityId,
): CommunityInvitationFields {
  return {
    communityId: communityId.valueOf(),
    identityId: joiner.valueOf(),
    invitationId: invited.getHash(),
    networkId: networkId.valueOf(),
  };
}

/** The admission of `joiner` under `invited`, with both of its proofs. */
export function admission(
  parents: CommunityOperation[],
  invited: Invitation,
  joiner: IdentityId,
  author = owner,
  createdAt = 2,
  args: Record<string, unknown> = {},
): CommunityOperation {
  const fields = invitationFieldsOf(invited.operation, joiner);

  return operation(
    CommunityOperationAction.MEMBER_JOINED,
    author,
    {
      consent: CommunityInvitationConsent.sign(fields, privateKeyOf(joiner)),
      identityId: joiner.valueOf(),
      invitationId: invited.operation.getHash(),
      method: 'invitation',
      possession: invited.key.signPossession(fields),
      ...args,
    },
    parents,
    createdAt,
  );
}

export function revoke(
  parents: CommunityOperation[],
  invited: Invitation,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.INVITATION_REVOKED,
    author,
    { invitationId: invited.operation.getHash() },
    parents,
  );
}
