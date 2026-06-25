import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { CommunityInvite } from '../../domain/entities/invites/CommunityInvite';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import { CommunityInviteWasCreatedEvent } from '../../domain/events/CommunityInviteWasCreatedEvent';
import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityInviteCreateMessage } from './messages/CommunityInviteCreateMessage';

export default class CommunityInviteCreator {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly inviteRepository: CommunityInviteRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async create(
    message: CommunityInviteCreateMessage,
  ): Promise<CommunityInvite> {
    const community = await this.communityFinder.findById(message.communityId);
    const invite = community.createInvite(
      message.actorIdentityId,
      message.expiresAt,
      message.maxUses,
      message.encryptedCommunityKey,
    );

    await this.inviteRepository.save(invite);
    await this.eventPublisher.publish([
      new CommunityInviteWasCreatedEvent(invite.getToken().valueOf(), {
        communityId: community.getId().valueOf(),
        invite: invite.toPrimitives(),
        networkId: community.getNetworkId().valueOf(),
      }),
    ]);
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITE_LINK_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.INVITE,
        invite.getToken(),
      ),
      {
        encryptedCommunityKeyStored: invite.hasEncryptedCommunityKey(),
        expiresAt: message.expiresAt?.valueOf(),
        maxUses: message.maxUses?.valueOf(),
      },
    );

    return invite;
  }
}
