import CommunityCreator from '@app/contexts/communities/application/create-community/CommunityCreator';
import { CommunityCreateMessage } from '@app/contexts/communities/application/create-community/messages/CommunityCreateMessage';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { PrivateNetworkRequiredError } from '@app/contexts/shared/domain/errors/PrivateNetworkRequiredError';
import NetworkPrivacyDirectory from '@app/contexts/shared/domain/networks/NetworkPrivacyDirectory';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';
import { unverifiedIdentitySignature } from '../domain/operations/CommunityOperationFixtures';

const OWNER_ID = 'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
const NETWORK_ID = '550e8400-e29b-41d4-a716-446655440000';
const NONCE = 'genesis-nonce';

async function genesisMessage(
  visibility?: string,
): Promise<CommunityCreateMessage> {
  const mutation = await signedMutation({
    identityId: OWNER_ID,
    kind: 'put',
    recordId: 'genesis-1',
    sequence: 0,
    store: 'communityOperations',
  });

  return new CommunityCreateMessage(
    OWNER_ID,
    NETWORK_ID,
    NONCE,
    'Codex crew',
    'Architecture refactor test community',
    {
      createdAt: 1780000000000,
      identitySignature: unverifiedIdentitySignature,
      mutation: mutation.toPrimitives(),
      parents: [],
    },
    {
      autoJoinEnabled: true,
      avatar: 'bagaaieraavatar',
      banner: 'bagaaierabanner',
      visibility,
    },
  );
}

function creator(networkIsPrivate: boolean) {
  const repository = mock<CommunityRepository>();
  const eventPublisher = mock<DomainEventPublisher>();
  const networkPrivacy = mock<NetworkPrivacyDirectory>();

  networkPrivacy.isPrivate.mockReturnValue(networkIsPrivate);

  return {
    eventPublisher,
    repository,
    creator: new CommunityCreator(repository, eventPublisher, networkPrivacy),
  };
}

describe('CommunityCreator', () => {
  it('creates a private community on a private network from the signed genesis operation', async () => {
    const { creator: communityCreator, eventPublisher, repository } =
      creator(true);
    const message = await genesisMessage();

    const community = await communityCreator.create(message);

    expect(repository.save).toHaveBeenCalledWith(
      message.genesis,
      message.operation.proof,
    );
    expect(message.genesis.getAction()).toEqual(
      CommunityOperationAction.COMMUNITY_CREATED,
    );
    expect(community.getId()).toEqual(
      CommunityId.derive(NETWORK_ID, OWNER_ID, NONCE),
    );
    expect(community.isOwner(new IdentityId(OWNER_ID))).toBe(true);
    expect(community.isMember(new IdentityId(OWNER_ID))).toBe(true);
    expect(community.isAutoJoinEnabled()).toBe(true);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('refuses a private community placed on a public network', async () => {
    const { creator: communityCreator, eventPublisher, repository } =
      creator(false);

    await expect(
      communityCreator.create(await genesisMessage('private')),
    ).rejects.toBeInstanceOf(PrivateNetworkRequiredError);

    expect(repository.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('creates a public community on a public network', async () => {
    const { creator: communityCreator, repository } = creator(false);
    const message = await genesisMessage('public');

    await communityCreator.create(message);

    expect(repository.save).toHaveBeenCalledWith(
      message.genesis,
      message.operation.proof,
    );
  });
});
