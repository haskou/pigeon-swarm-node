import CommunityTextChannelCreator from '@app/contexts/communities/application/create-channel/CommunityTextChannelCreator';
import CommunityVoiceChannelCreator from '@app/contexts/communities/application/create-channel/CommunityVoiceChannelCreator';
import { CommunityChannelCreateMessage } from '@app/contexts/communities/application/create-channel/messages/CommunityChannelCreateMessage';
import CommunityChannelDeleter from '@app/contexts/communities/application/delete-channel/CommunityChannelDeleter';
import { CommunityChannelDeleteMessage } from '@app/contexts/communities/application/delete-channel/messages/CommunityChannelDeleteMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityChannelRenamer from '@app/contexts/communities/application/rename-channel/CommunityChannelRenamer';
import { CommunityChannelRenameMessage } from '@app/contexts/communities/application/rename-channel/messages/CommunityChannelRenameMessage';
import CommunityChannelPermissionsUpdater from '@app/contexts/communities/application/update-channel-permissions/CommunityChannelPermissionsUpdater';
import { CommunityChannelPermissionsUpdateMessage } from '@app/contexts/communities/application/update-channel-permissions/messages/CommunityChannelPermissionsUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationApplier } from '@app/contexts/communities/domain/operations/CommunityOperationApplier';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';
import {
  genesis,
  mallory,
  owner,
} from '../domain/operations/CommunityOperationFixtures';

const CREATED_AT = 1780000000000;

describe('Community channel use cases', () => {
  let community: Community;
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;
  let moderationLog: { createdAt: number; mutation: unknown };
  let operation: {
    createdAt: number;
    mutation: unknown;
    parents: string[];
  };

  async function primitivesFor(
    actor: string,
  ): Promise<[typeof moderationLog, typeof operation]> {
    const proof = (recordId: string, store: string) =>
      signedMutation({
        identityId: actor,
        kind: 'put',
        recordId,
        sequence: 0,
        store,
      }).then((signed) => signed.toPrimitives());

    return [
      {
        createdAt: CREATED_AT,
        mutation: await proof('log-1', 'moderationLogs'),
      },
      {
        createdAt: CREATED_AT,
        mutation: await proof('op-1', 'communityOperations'),
        parents: [genesis().getHash()],
      },
    ];
  }

  async function prepare(actor: string): Promise<void> {
    [moderationLog, operation] = await primitivesFor(actor);
  }

  function savedOperation(): CommunityOperation {
    return communityRepository.save.mock.calls[0][0];
  }

  beforeEach(() => {
    community = CommunityOperationApplier.create(genesis());
    communityFinder = mock<CommunityFinder>();
    communityRepository = mock<CommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    communityFinder.findById.mockResolvedValue(community);
  });

  it.each([
    ['text', CommunityTextChannelCreator, 'getTextChannel'],
    ['voice', CommunityVoiceChannelCreator, 'getVoiceChannel'],
  ] as const)('creates a %s channel', async (type, Creator, getter) => {
    await prepare(owner.valueOf());
    const message = new CommunityChannelCreateMessage(
      community.getId().valueOf(),
      owner.valueOf(),
      'lounge',
      moderationLog,
      operation,
    );
    const channelId = CommunityChannelId.derive(
      community.getId().valueOf(),
      owner.valueOf(),
      CREATED_AT,
    );

    const channel = await new Creator(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).create(message);

    expect(channel).toBe(community[getter](channelId));
    expect(channel.getId().isEqual(channelId)).toBe(true);
    expect(savedOperation().getAction()).toEqual(
      CommunityOperationAction.CHANNEL_CREATED,
    );
    expect(savedOperation().getArguments()).toEqual({
      channelId: channelId.valueOf(),
      name: 'lounge',
      type,
    });
    expect(communityRepository.save).toHaveBeenCalledWith(
      expect.any(CommunityOperation),
      message.operation.proof,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { name: 'lounge', type },
    );
    expect(eventPublisher.publish).toHaveBeenCalled();
  });

  it('rejects channel creation by a non-member without logging or saving', async () => {
    await prepare(mallory.valueOf());

    await expect(
      new CommunityTextChannelCreator(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).create(
        new CommunityChannelCreateMessage(
          community.getId().valueOf(),
          mallory.valueOf(),
          'lounge',
          moderationLog,
          operation,
        ),
      ),
    ).rejects.toThrow();

    expect(moderationLogRecorder.record).not.toHaveBeenCalled();
    expect(communityRepository.save).not.toHaveBeenCalled();
  });

  describe('with an existing channel', () => {
    let channelId: string;

    beforeEach(() => {
      channelId = community
        .addTextChannel(owner, new CommunityChannelName('general'))
        .getId()
        .valueOf();
      community.pullDomainEvents();
    });

    it('renames the channel', async () => {
      await prepare(owner.valueOf());
      const message = new CommunityChannelRenameMessage(
        community.getId().valueOf(),
        channelId,
        owner.valueOf(),
        'renamed',
        moderationLog,
        operation,
      );

      const result = await new CommunityChannelRenamer(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).rename(message);

      expect(result.toPrimitives().textChannels[0].name).toBe('renamed');
      expect(savedOperation().getAction()).toEqual(
        CommunityOperationAction.CHANNEL_RENAMED,
      );
      expect(savedOperation().getArguments()).toEqual({
        channelId,
        name: 'renamed',
      });
      expect(communityRepository.save).toHaveBeenCalledWith(
        expect.any(CommunityOperation),
        message.operation.proof,
      );
      expect(moderationLogRecorder.record).toHaveBeenCalledWith(
        community,
        message.actorIdentityId,
        CommunityModerationAction.CHANNEL_RENAMED,
        expect.any(CommunityModerationTarget),
        message.moderationLog,
        { name: 'renamed' },
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('deletes the channel and logs its type', async () => {
      await prepare(owner.valueOf());
      const message = new CommunityChannelDeleteMessage(
        community.getId().valueOf(),
        channelId,
        owner.valueOf(),
        moderationLog,
        operation,
      );

      const result = await new CommunityChannelDeleter(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).delete(message);

      expect(result.toPrimitives().textChannels).toHaveLength(0);
      expect(savedOperation().getAction()).toEqual(
        CommunityOperationAction.CHANNEL_DELETED,
      );
      expect(savedOperation().getArguments()).toEqual({ channelId });
      expect(communityRepository.save).toHaveBeenCalledWith(
        expect.any(CommunityOperation),
        message.operation.proof,
      );
      expect(moderationLogRecorder.record).toHaveBeenCalledWith(
        community,
        message.actorIdentityId,
        CommunityModerationAction.CHANNEL_DELETED,
        expect.any(CommunityModerationTarget),
        message.moderationLog,
        { type: 'text' },
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('updates the channel permissions', async () => {
      await prepare(owner.valueOf());
      const message = new CommunityChannelPermissionsUpdateMessage(
        community.getId().valueOf(),
        channelId,
        owner.valueOf(),
        [],
        moderationLog,
        operation,
      );

      await new CommunityChannelPermissionsUpdater(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).update(message);

      expect(savedOperation().getAction()).toEqual(
        CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED,
      );
      expect(savedOperation().getArguments()).toEqual({
        channelId,
        visibleRoleIds: [],
      });
      expect(communityRepository.save).toHaveBeenCalledWith(
        expect.any(CommunityOperation),
        message.operation.proof,
      );
      expect(moderationLogRecorder.record).toHaveBeenCalledWith(
        community,
        message.actorIdentityId,
        CommunityModerationAction.CHANNEL_PERMISSIONS_UPDATED,
        expect.any(CommunityModerationTarget),
        message.moderationLog,
        { visibleRoleIds: [] },
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('rejects deleting a channel for a non-member without logging or saving', async () => {
      await prepare(mallory.valueOf());

      await expect(
        new CommunityChannelDeleter(
          communityFinder,
          communityRepository,
          eventPublisher,
          moderationLogRecorder,
        ).delete(
          new CommunityChannelDeleteMessage(
            community.getId().valueOf(),
            channelId,
            mallory.valueOf(),
            moderationLog,
            operation,
          ),
        ),
      ).rejects.toThrow();

      expect(moderationLogRecorder.record).not.toHaveBeenCalled();
      expect(communityRepository.save).not.toHaveBeenCalled();
    });
  });
});
