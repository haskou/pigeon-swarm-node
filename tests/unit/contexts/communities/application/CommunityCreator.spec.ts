import CommunityCreator from '@app/contexts/communities/application/create-community/CommunityCreator';
import { CommunityCreateMessage } from '@app/contexts/communities/application/create-community/messages/CommunityCreateMessage';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';

const OWNER_ID = 'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
const NETWORK_ID = '550e8400-e29b-41d4-a716-446655440000';
const NONCE = 'genesis-nonce';

describe('CommunityCreator', () => {
  it('creates a private community from the signed genesis operation', async () => {
    const repository = mock<CommunityRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const mutation = await signedMutation({
      identityId: OWNER_ID,
      kind: 'put',
      recordId: 'genesis-1',
      sequence: 0,
      store: 'communityOperations',
    });
    const message = new CommunityCreateMessage(
      OWNER_ID,
      NETWORK_ID,
      NONCE,
      'Codex crew',
      'Architecture refactor test community',
      {
        createdAt: 1780000000000,
        mutation: mutation.toPrimitives(),
        parents: [],
      },
      'bagaaieraavatar',
      'bagaaierabanner',
      { autoJoinEnabled: true },
    );

    const community = await new CommunityCreator(
      repository,
      eventPublisher,
    ).create(message);

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
});
