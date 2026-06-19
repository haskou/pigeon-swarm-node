import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { CommunityChannels } from '../entities/channels/CommunityChannels';
import { CommunityMembership } from '../entities/membership/CommunityMembership';
import { CommunityChannelMessage } from '../entities/messages/CommunityChannelMessage';
import { CommunityChannelMessagePayload } from '../entities/messages/CommunityChannelMessagePayload';
import { CommunitySettings } from '../entities/profile/CommunitySettings';
import { CommunityChannelMessageAuthorMismatchError } from '../errors/CommunityChannelMessageAuthorMismatchError';
import { CommunityChannelNotFoundError } from '../errors/CommunityChannelNotFoundError';
import { CommunityMemberBannedError } from '../errors/CommunityMemberBannedError';
import { CommunityMemberNotFoundError } from '../errors/CommunityMemberNotFoundError';
import { CommunityChannelMessageMentions } from '../types/CommunityChannelMessageMentions';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityPermission } from '../value-objects/CommunityPermission';
import { CommunityPermissionValidator } from './CommunityPermissionValidator';

export class CommunityAccessValidator {
  constructor(
    private readonly ownerIdentityId: IdentityId,
    private readonly membership: CommunityMembership,
    private readonly channels: CommunityChannels,
    private readonly settings: CommunitySettings,
  ) {}

  private assertHasPermission(
    identityId: IdentityId,
    permission: CommunityPermission,
  ): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      permission,
    );
  }

  private isBanned(identityId: IdentityId): boolean {
    return this.membership.isBanned(identityId);
  }

  private isMember(identityId: IdentityId): boolean {
    return this.membership.isMember(identityId);
  }

  private ensureTextChannelExists(channelId: CommunityChannelId): void {
    assert(
      this.channels.hasText(channelId),
      new CommunityChannelNotFoundError(),
    );
  }

  private ensureVoiceChannelExists(channelId: CommunityChannelId): void {
    assert(
      this.channels.hasVoice(channelId),
      new CommunityChannelNotFoundError(),
    );
  }

  public assertIsMember(identityId: IdentityId): void {
    assert(this.isMember(identityId), new CommunityMemberNotFoundError());
  }

  public assertIsNotBanned(identityId: IdentityId): void {
    assert(!this.isBanned(identityId), new CommunityMemberBannedError());
  }

  public assertCanCreateInvite(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.CREATE_INVITES);
  }

  public assertCanApproveMembers(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.APPROVE_MEMBERS);
  }

  public assertCanRejectMembers(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.REJECT_MEMBERS);
  }

  public assertCanManageMembers(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.MANAGE_MEMBERS);
  }

  public assertCanViewModerationLog(identityId: IdentityId): void {
    this.assertCanManageMembers(identityId);
  }

  public assertCanManageChannels(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.MANAGE_CHANNELS);
  }

  public assertCanManageRoles(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.MANAGE_ROLES);
  }

  public assertCanBanMembers(identityId: IdentityId): void {
    this.assertHasPermission(identityId, CommunityPermission.BAN_MEMBERS);
  }

  public assertCanViewTextChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.ensureTextChannelExists(channelId);
    CommunityPermissionValidator.assertCanAccessChannel(
      this.ownerIdentityId,
      this.membership,
      identityId,
      this.channels.textChannelPermissions(channelId),
    );
  }

  public assertCanReactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanSendMessage(identityId, channelId);
    this.assertHasPermission(identityId, CommunityPermission.SEND_STICKERS);
  }

  public assertCanSearchMessages(): void {
    this.settings.assertCanSearchMessages();
  }

  public assertCanConnectVoice(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.ensureVoiceChannelExists(channelId);
    CommunityPermissionValidator.assertCanAccessChannel(
      this.ownerIdentityId,
      this.membership,
      identityId,
      this.channels.voiceChannelPermissions(channelId),
    );
    this.assertHasPermission(identityId, CommunityPermission.CONNECT_VOICE);
  }

  public assertCanDeleteMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(actor);
    this.ensureTextChannelExists(channelId);

    if (targetMessage.wasAuthoredBy(actor)) {
      return;
    }

    this.assertHasPermission(actor, CommunityPermission.MANAGE_MESSAGES);
  }

  public assertCanManageMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertHasPermission(identityId, CommunityPermission.MANAGE_MESSAGES);
  }

  public assertCanSendMessage(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertHasPermission(identityId, CommunityPermission.SEND_MESSAGES);
  }

  public assertCanUseMessagePayload(
    payload: CommunityChannelMessagePayload,
  ): void {
    this.settings.assertCanUseMessagePayload(payload);
  }

  public assertCanUseMessageMentions(
    identityId: IdentityId,
    mentions: CommunityChannelMessageMentions,
  ): void {
    for (const mention of mentions) {
      if (mention.isEveryone()) {
        this.assertHasPermission(
          identityId,
          CommunityPermission.MENTION_EVERYONE,
        );
      }

      if (mention.isHere()) {
        this.assertHasPermission(identityId, CommunityPermission.MENTION_HERE);
      }

      if (mention.isRole()) {
        this.assertHasPermission(identityId, CommunityPermission.MENTION_ROLES);
      }
    }
  }

  public assertCanEditMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
    payload: CommunityChannelMessagePayload,
    mentions: CommunityChannelMessageMentions,
  ): void {
    assert(
      targetMessage.wasAuthoredBy(actor),
      new CommunityChannelMessageAuthorMismatchError(),
    );
    this.assertCanSendMessage(actor, channelId);
    this.assertCanUseMessagePayload(payload);
    this.assertCanUseMessageMentions(actor, mentions);
  }

  public assertCanSendChannelMessage(
    authorIdentityId: IdentityId,
    channelId: CommunityChannelId,
    payload: CommunityChannelMessagePayload,
    mentions: CommunityChannelMessageMentions,
  ): void {
    this.assertCanSendMessage(authorIdentityId, channelId);
    this.assertCanUseMessagePayload(payload);
    this.assertCanUseMessageMentions(authorIdentityId, mentions);
  }

  public visibleChannelsFor(
    identityId: IdentityId,
  ): ReturnType<CommunityChannels['toPrimitives']> {
    return this.channels.visiblePrimitivesFor((permissions) =>
      CommunityPermissionValidator.canAccessChannel(
        this.ownerIdentityId,
        this.membership,
        identityId,
        permissions,
      ),
    );
  }

  public visibleTextChannelIdsFor(
    identityId: IdentityId,
  ): CommunityChannelId[] {
    this.assertIsMember(identityId);

    return this.channels.visibleTextChannelIdsFor((permissions) =>
      CommunityPermissionValidator.canAccessChannel(
        this.ownerIdentityId,
        this.membership,
        identityId,
        permissions,
      ),
    );
  }

  public visibleMembersForTextChannel(
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.ensureTextChannelExists(channelId);

    return this.membership.membersWithAnyRole(
      this.channels.textChannelPermissions(channelId).getVisibleRoleIds(),
      this.ownerIdentityId,
    );
  }

  public visibleMembersForTextChannelPollCreation(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertHasPermission(identityId, CommunityPermission.CREATE_POLLS);

    return this.visibleMembersForTextChannel(channelId);
  }

  public visibleMembersForTextChannelPollVote(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.assertCanViewTextChannel(identityId, channelId);

    return this.visibleMembersForTextChannel(channelId);
  }
}
