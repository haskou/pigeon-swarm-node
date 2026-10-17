import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { CommunityRequestType } from '@app/contexts/communities/domain/value-objects/CommunityRequestType';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

type Args = never[];

interface Section {
  invalid: { args: Args; name: string }[];
  valid: { args: Args; id: string; name: string }[];
}

const vectors = cryptoVectors<Record<string, Section>>('commitment-ids');

/** Shared vectors for ids this node refuses to derive, such as direct invitations. */
const unsupported: Record<string, string[]> = {
  communityRequest: ['invitation'],
};

const derivations: Record<string, (...args: Args) => string> = {
  community: (networkId, ownerIdentityId, nonce) =>
    CommunityId.derive(networkId, ownerIdentityId, nonce).valueOf(),
  communityChannel: (communityId, creatorIdentityId, createdAt) =>
    CommunityChannelId.derive(
      communityId,
      creatorIdentityId,
      createdAt,
    ).valueOf(),
  communityModerationLog: (communityId, actor, action, type, target, at) =>
    CommunityModerationLogId.derive(
      communityId,
      actor,
      action,
      type,
      target,
      at,
    ).valueOf(),
  communityRequest: (communityId, type, creator, identityId, createdAt) => {
    new CommunityRequestType(type);

    return CommunityRequestId.derive(
      communityId,
      creator,
      identityId,
      createdAt,
    ).valueOf();
  },
  communityRole: (communityId, creatorIdentityId, createdAt) =>
    CommunityRoleId.derive(communityId, creatorIdentityId, createdAt).valueOf(),
};

describe.each(Object.keys(derivations))('%s commitment id vectors', (key) => {
  const derive = derivations[key];

  const refused = unsupported[key] ?? [];
  const valid = vectors[key].valid.filter(
    ({ name }) => !refused.includes(name),
  );
  const invalid = [
    ...vectors[key].invalid,
    ...vectors[key].valid.filter(({ name }) => refused.includes(name)),
  ];

  it.each(valid)('derives $name', ({ args, id }) => {
    expect(derive(...args)).toBe(id);
  });

  it.each(invalid)('rejects $name', ({ args }) => {
    expect(() => derive(...args)).toThrow();
  });
});
