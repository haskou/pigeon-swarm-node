import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityProfileUpdater from '@app/contexts/communities/application/update-profile/CommunityProfileUpdater';
import { CommunityProfileUpdateMessage } from '@app/contexts/communities/application/update-profile/messages/CommunityProfileUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationApplier } from '@app/contexts/communities/domain/operations/CommunityOperationApplier';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../../public-mutations/support/signedMutation';
import {
  genesis,
  mallory,
  owner,
} from '../../domain/operations/CommunityOperationFixtures';

describe('CommunityProfileUpdater', () => {
  let community: Community;
  let communityFinder: MockProxy<CommunityFinder>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;
  let repository: MockProxy<CommunityRepository>;
  let updater: CommunityProfileUpdater;

  async function messageBy(
    actor: string,
    overrides: { autoJoinEnabled?: boolean; avatar?: string } = {},
  ): Promise<CommunityProfileUpdateMessage> {
    const mutation = (recordId: string, store: string) =>
      signedMutation({
        identityId: actor,
        kind: 'put',
        recordId,
        sequence: 0,
        store,
      }).then((proof) => proof.toPrimitives());

    return new CommunityProfileUpdateMessage({
      actorIdentityId: actor,
      communityId: community.getId().valueOf(),
      description: 'Updated description',
      moderationLog: {
        createdAt: 1780000000000,
        mutation: await mutation('log-1', 'moderationLogs'),
      },
      name: 'Updated community',
      operation: {
        createdAt: 1780000000000,
        mutation: await mutation('op-1', 'communityOperations'),
        parents: [genesis().getHash()],
      },
      ...overrides,
    });
  }

  beforeEach(() => {
    community = CommunityOperationApplier.create(genesis());
    communityFinder = mock<CommunityFinder>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    repository = mock<CommunityRepository>();
    updater = new CommunityProfileUpdater(
      communityFinder,
      repository,
      eventPublisher,
      moderationLogRecorder,
    );
    communityFinder.findById.mockResolvedValue(community);
  });

  it('applies the signed profile operation and saves it', async () => {
    const message = await messageBy(owner.valueOf(), {
      autoJoinEnabled: true,
      avatar: 'bafybeigavatar',
    });

    const result = await updater.update(message);

    expect(result).toBe(community);
    expect(result.toPrimitives()).toEqual(
      expect.objectContaining({
        autoJoinEnabled: true,
        avatar: 'bafybeigavatar',
        description: 'Updated description',
        name: 'Updated community',
      }),
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.COMMUNITY_UPDATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      expect.objectContaining({ name: 'Updated community' }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.any(CommunityOperation),
      message.operation.proof,
    );
    const operation = repository.save.mock.calls[0][0];

    expect(operation.getAction()).toEqual(
      CommunityOperationAction.COMMUNITY_UPDATED,
    );
    expect(operation.getArguments()).toEqual({
      autoJoinEnabled: true,
      avatar: 'bafybeigavatar',
      description: 'Updated description',
      name: 'Updated community',
    });
    expect(eventPublisher.publish).toHaveBeenCalled();
  });

  it('rejects an author without permission and neither logs nor saves', async () => {
    await expect(
      updater.update(await messageBy(mallory.valueOf())),
    ).rejects.toThrow();

    expect(moderationLogRecorder.record).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
