import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  assert,
  PrimitiveOf,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { CommunityOwnerValidator } from './asserts/CommunityOwnerValidator';
import { CommunityPermissionValidator } from './asserts/CommunityPermissionValidator';
import { CommunityChannelPermissions } from './entities/channels/CommunityChannelPermissions';
import { CommunityChannels } from './entities/channels/CommunityChannels';
import { CommunityTextChannel } from './entities/channels/CommunityTextChannel';
import { CommunityVoiceChannel } from './entities/channels/CommunityVoiceChannel';
import { CommunityInvite } from './entities/invites/CommunityInvite';
import { CommunityMembership } from './entities/membership/CommunityMembership';
import { CommunityMembershipRequest } from './entities/membership/CommunityMembershipRequest';
import { CommunityRole } from './entities/membership/CommunityRole';
import { CommunityRoles } from './entities/membership/CommunityRoles';
import { CommunityChannelMessage } from './entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageEdition } from './entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMetadata } from './entities/messages/CommunityChannelMessageMetadata';
import { CommunityChannelMessagePayload } from './entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageReaction } from './entities/messages/CommunityChannelMessageReaction';
import { CommunityProfile } from './entities/profile/CommunityProfile';
import { CommunitySettings } from './entities/profile/CommunitySettings';
import { CommunityChannelMessageAuthorMismatchError } from './errors/CommunityChannelMessageAuthorMismatchError';
import { CommunityMemberBannedError } from './errors/CommunityMemberBannedError';
import { CommunityMemberNotFoundError } from './errors/CommunityMemberNotFoundError';
import { CommunityOwnerCannotBeKickedError } from './errors/CommunityOwnerCannotBeKickedError';
import { CommunityOwnerCannotLeaveError } from './errors/CommunityOwnerCannotLeaveError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
import { CommunityChannelWasCreatedEvent } from './events/CommunityChannelWasCreatedEvent';
import { CommunityChannelWasDeletedEvent } from './events/CommunityChannelWasDeletedEvent';
import { CommunityChannelWasRenamedEvent } from './events/CommunityChannelWasRenamedEvent';
import { CommunityMemberWasAddedEvent } from './events/CommunityMemberWasAddedEvent';
import { CommunityMemberWasLeftEvent } from './events/CommunityMemberWasLeftEvent';
import { CommunityWasCreatedEvent } from './events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from './events/CommunityWasUpdatedEvent';
import { CommunityChannelMessageAttachments } from './types/CommunityChannelMessageAttachments';
import { CommunityChannelMessageMentions } from './types/CommunityChannelMessageMentions';
import { CommunityAvatar } from './value-objects/CommunityAvatar';
import { CommunityBanner } from './value-objects/CommunityBanner';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from './value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityChannelName } from './value-objects/CommunityChannelName';
import { CommunityDescription } from './value-objects/CommunityDescription';
import { CommunityId } from './value-objects/CommunityId';
import { CommunityInviteMaxUses } from './value-objects/CommunityInviteMaxUses';
import { CommunityName } from './value-objects/CommunityName';
import { CommunityPermission } from './value-objects/CommunityPermission';
import { CommunityRoleId } from './value-objects/CommunityRoleId';
import { CommunityRoleName } from './value-objects/CommunityRoleName';
import { EncryptedCommunityInviteKey } from './value-objects/EncryptedCommunityInviteKey';

export class Community extends AggregateRoot {
  public static create(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    profile: CommunityProfile,
    settings: CommunitySettings,
  ): Community {
    const community = new Community(
      CommunityId.generate(),
      networkId,
      ownerIdentityId,
      profile,
      CommunityMembership.create([ownerIdentityId], CommunityRoles.default()),
      new CommunityChannels([], []),
      settings,
    );

    community.record(
      new CommunityWasCreatedEvent(community.id.valueOf(), {
        community: community.toPrimitives(),
        communityId: community.id.valueOf(),
        memberIds: [ownerIdentityId.valueOf()],
        networkId: networkId.valueOf(),
        ownerIdentityId: ownerIdentityId.valueOf(),
      }),
    );

    return community;
  }

  public static fromPrimitives(primitives: PrimitiveOf<Community>): Community {
    return new Community(
      new CommunityId(primitives.id),
      new NetworkId(primitives.networkId),
      new IdentityId(primitives.ownerIdentityId),
      new CommunityProfile(
        new CommunityName(primitives.name),
        new CommunityDescription(primitives.description),
        primitives.avatar ? new CommunityAvatar(primitives.avatar) : undefined,
        primitives.banner ? new CommunityBanner(primitives.banner) : undefined,
      ),
      CommunityMembership.create(
        primitives.memberIds.map((memberId) => new IdentityId(memberId)),
        CommunityRoles.fromPrimitives(primitives.roles, primitives.memberRoles),
        (primitives.bannedMemberIds || []).map(
          (memberId) => new IdentityId(memberId),
        ),
      ),
      new CommunityChannels(
        primitives.textChannels.map((channel) =>
          CommunityTextChannel.fromPrimitives(channel),
        ),
        (primitives.voiceChannels || []).map((channel) =>
          CommunityVoiceChannel.fromPrimitives(channel),
        ),
      ),
      CommunitySettings.fromPrimitives({
        autoJoinEnabled: primitives.autoJoinEnabled,
        createdAt: primitives.createdAt,
        discoverable: primitives.discoverable,
        visibility: primitives.visibility,
      }),
    );
  }

  constructor(
    private readonly id: CommunityId,
    private readonly networkId: NetworkId,
    private readonly ownerIdentityId: IdentityId,
    private profile: CommunityProfile,
    private readonly membership: CommunityMembership,
    private readonly channels: CommunityChannels,
    private readonly settings: CommunitySettings,
  ) {
    super();
  }

  private assertCanMention(
    identityId: IdentityId,
    mentions: CommunityChannelMessageMentions,
  ): void {
    for (const mention of mentions) {
      if (mention.isEveryone()) {
        CommunityPermissionValidator.assertHasPermission(
          this.ownerIdentityId,
          this.membership,
          identityId,
          CommunityPermission.MENTION_EVERYONE,
        );
      }

      if (mention.isHere()) {
        CommunityPermissionValidator.assertHasPermission(
          this.ownerIdentityId,
          this.membership,
          identityId,
          CommunityPermission.MENTION_HERE,
        );
      }

      if (mention.isRole()) {
        CommunityPermissionValidator.assertHasPermission(
          this.ownerIdentityId,
          this.membership,
          identityId,
          CommunityPermission.MENTION_ROLES,
        );
      }
    }
  }

  private assertCanSendMessage(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.SEND_MESSAGES,
    );
  }

  private assertCanUseMessagePayload(
    payload: CommunityChannelMessagePayload,
  ): void {
    this.settings.assertCanUseMessagePayload(payload);
  }

  private eventAttributes() {
    const primitives = this.toPrimitives();

    return {
      communityId: primitives.id,
      memberIds: primitives.memberIds,
      networkId: primitives.networkId,
    };
  }

  private voiceChannelEventPrimitives(
    channel: CommunityVoiceChannel,
  ): ReturnType<CommunityVoiceChannel['toPrimitives']> & {
    connectedIdentityIds: string[];
  } {
    return {
      ...channel.toPrimitives(),
      connectedIdentityIds: [],
    };
  }

  private join(member: IdentityId): void {
    assert(!this.membership.isBanned(member), new CommunityMemberBannedError());

    if (this.isMember(member)) {
      return;
    }

    this.membership.add(member);
    this.record(
      new CommunityMemberWasAddedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
        identityId: member.valueOf(),
      }),
    );
  }

  private assertIsMember(identityId: IdentityId): void {
    assert(this.isMember(identityId), new CommunityMemberNotFoundError());
  }

  private assertIsNotBanned(identityId: IdentityId): void {
    assert(
      !this.membership.isBanned(identityId),
      new CommunityMemberBannedError(),
    );
  }

  private assertCanCreateInvite(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.CREATE_INVITES,
    );
  }

  private assertCanApproveMembers(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.APPROVE_MEMBERS,
    );
  }

  private assertCanRejectMembers(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.REJECT_MEMBERS,
    );
  }

  private assertCanManageMembers(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.MANAGE_MEMBERS,
    );
  }

  private assertCanViewModerationLog(identityId: IdentityId): void {
    this.assertCanManageMembers(identityId);
  }

  private assertCanManageChannels(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.MANAGE_CHANNELS,
    );
  }

  private assertCanManageRoles(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.MANAGE_ROLES,
    );
  }

  private assertCanBanMembers(identityId: IdentityId): void {
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.BAN_MEMBERS,
    );
  }

  private assertHasTextChannel(channelId: CommunityChannelId): void {
    this.channels.assertHasText(channelId);
  }

  private assertHasVoiceChannel(channelId: CommunityChannelId): void {
    this.channels.assertHasVoice(channelId);
  }

  private assertCanViewTextChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.assertHasTextChannel(channelId);
    CommunityPermissionValidator.assertCanAccessChannel(
      this.ownerIdentityId,
      this.membership,
      identityId,
      this.channels.textChannelPermissions(channelId),
    );
  }

  private assertCanReactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanSendMessage(identityId, channelId);
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.SEND_STICKERS,
    );
  }

  private assertCanSearchMessages(): void {
    this.settings.assertCanSearchMessages();
  }

  private assertCanConnectVoice(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.assertHasVoiceChannel(channelId);
    CommunityPermissionValidator.assertCanAccessChannel(
      this.ownerIdentityId,
      this.membership,
      identityId,
      this.channels.voiceChannelPermissions(channelId),
    );
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.CONNECT_VOICE,
    );
  }

  private assertCanDeleteMessage(
    actor: IdentityId,
    targetAuthor: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(actor);
    this.assertHasTextChannel(channelId);

    if (actor.isEqual(targetAuthor)) {
      return;
    }

    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      actor,
      CommunityPermission.MANAGE_MESSAGES,
    );
  }

  private assertCanManageMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.MANAGE_MESSAGES,
    );
  }

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.assertCanManageMembers(actor);
    this.join(member);
  }

  public joinWithInvite(member: IdentityId): void {
    this.join(member);
  }

  public createInvite(
    actor: IdentityId,
    expiresAt?: Timestamp,
    maxUses?: CommunityInviteMaxUses,
    encryptedCommunityKey?: EncryptedCommunityInviteKey,
  ): CommunityInvite {
    this.assertCanCreateInvite(actor);

    return CommunityInvite.create(
      this.id,
      actor,
      expiresAt,
      maxUses,
      encryptedCommunityKey,
    );
  }

  public inviteMember(
    actor: IdentityId,
    invitedIdentityId: IdentityId,
  ): CommunityMembershipRequest {
    this.assertCanCreateInvite(actor);

    return CommunityMembershipRequest.invitation(
      this.id,
      actor,
      invitedIdentityId,
      this.ownerIdentityId,
    );
  }

  public acceptMembershipRequest(
    actor: IdentityId,
    membershipRequest: CommunityMembershipRequest,
  ): void {
    if (membershipRequest.isRequest()) {
      this.assertCanApproveMembers(actor);
    }

    membershipRequest.accept(
      actor,
      membershipRequest.isRequest() ? actor : this.ownerIdentityId,
    );
    this.join(membershipRequest.getIdentityId());
  }

  public declineMembershipRequest(
    actor: IdentityId,
    membershipRequest: CommunityMembershipRequest,
  ): void {
    if (membershipRequest.isRequest()) {
      this.assertCanRejectMembers(actor);
    }

    membershipRequest.decline(
      actor,
      membershipRequest.isRequest() ? actor : this.ownerIdentityId,
    );
  }

  public sendChannelMessage(
    metadata: CommunityChannelMessageMetadata,
    payload: CommunityChannelMessagePayload,
    signature: Signature,
    attachmentExternalIdentifiers: CommunityChannelMessageAttachments,
    mentions: CommunityChannelMessageMentions,
  ): CommunityChannelMessage {
    const authorIdentityId = metadata.getAuthorIdentityId();
    const channelId = metadata.getChannelId();

    this.assertCanSendMessage(authorIdentityId, channelId);
    this.assertCanUseMessagePayload(payload);
    this.assertCanMention(authorIdentityId, mentions);

    return CommunityChannelMessage.create(
      metadata,
      payload,
      signature,
      attachmentExternalIdentifiers,
      mentions,
    );
  }

  public acceptSentChannelMessage(
    message: CommunityChannelMessage,
    payload: CommunityChannelMessagePayload,
  ): CommunityChannelMessage {
    const authorIdentityId = message.getAuthorIdentityId();

    this.assertCanSendMessage(authorIdentityId, message.getChannelId());
    this.assertCanUseMessagePayload(payload);
    this.assertCanMention(authorIdentityId, message.getMentions());

    return message;
  }

  public editChannelMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
    edition: CommunityChannelMessageEdition,
  ): CommunityChannelMessage {
    assert(
      targetMessage.getAuthorIdentityId().isEqual(actor),
      new CommunityChannelMessageAuthorMismatchError(),
    );

    this.assertCanSendMessage(actor, channelId);
    this.assertCanUseMessagePayload(edition.getPayload());
    this.assertCanMention(actor, edition.getMentions());

    return edition.applyTo(targetMessage);
  }

  public reactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    emoji: CommunityChannelMessageReactionEmoji,
  ): CommunityChannelMessageReaction {
    this.assertCanReactWithSticker(identityId, channelId);

    return CommunityChannelMessageReaction.create(
      this.id,
      channelId,
      messageId,
      identityId,
      emoji,
    );
  }

  public membersForVoiceChannelCall(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.assertCanConnectVoice(identityId, channelId);

    return this.getMemberIds();
  }

  public deleteChannelMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanDeleteMessage(
      actor,
      targetMessage.getAuthorIdentityId(),
      channelId,
    );
  }

  public viewTextChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
  }

  public manageChannelMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanManageMessages(identityId, channelId);
  }

  public searchMessages(): void {
    this.assertCanSearchMessages();
  }

  public searchTextChannelMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertCanSearchMessages();
  }

  public viewModerationLog(identityId: IdentityId): void {
    this.assertCanViewModerationLog(identityId);
  }

  public leave(member: IdentityId): void {
    this.assertIsMember(member);
    assert(
      !this.ownerIdentityId.isEqual(member) || this.membership.size() === 1,
      new CommunityOwnerCannotLeaveError(),
    );

    this.membership.remove(member);
    this.record(
      new CommunityMemberWasLeftEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
        identityId: member.valueOf(),
      }),
    );
  }

  public kickMember(actor: IdentityId, member: IdentityId): void {
    this.assertCanManageMembers(actor);
    this.assertIsMember(member);
    assert(
      !this.ownerIdentityId.isEqual(member),
      new CommunityOwnerCannotBeKickedError(),
    );

    this.membership.remove(member);
    this.record(
      new CommunityMemberWasLeftEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        actorIdentityId: actor.valueOf(),
        community: this.toPrimitives(),
        identityId: member.valueOf(),
      }),
    );
  }

  public addTextChannel(
    actor: IdentityId,
    name: CommunityChannelName,
  ): CommunityTextChannel {
    this.assertCanManageChannels(actor);

    const channel = this.channels.addText(name);

    this.record(
      new CommunityChannelWasCreatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        channel: channel.toPrimitives(),
      }),
    );

    return channel;
  }

  public addVoiceChannel(
    actor: IdentityId,
    name: CommunityChannelName,
  ): CommunityVoiceChannel {
    this.assertCanManageChannels(actor);

    const channel = this.channels.addVoice(name);

    this.record(
      new CommunityChannelWasCreatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        channel: this.voiceChannelEventPrimitives(channel),
      }),
    );

    return channel;
  }

  public renameChannel(
    actor: IdentityId,
    channelId: CommunityChannelId,
    name: CommunityChannelName,
  ): void {
    this.assertCanManageChannels(actor);
    this.channels.rename(channelId, name);
    this.record(
      new CommunityChannelWasRenamedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        channelId: channelId.valueOf(),
        name: name.valueOf(),
      }),
    );
  }

  public deleteChannel(
    actor: IdentityId,
    channelId: CommunityChannelId,
  ): 'text' | 'voice' {
    this.assertCanManageChannels(actor);

    const channelType = this.channels.remove(channelId);

    this.record(
      new CommunityChannelWasDeletedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        channelId: channelId.valueOf(),
      }),
    );

    return channelType;
  }

  public updateChannelPermissions(
    actor: IdentityId,
    channelId: CommunityChannelId,
    permissions: CommunityChannelPermissions,
  ): void {
    this.assertCanManageChannels(actor);
    this.channels.updatePermissions(channelId, permissions);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public addRole(
    actor: IdentityId,
    name: CommunityRoleName,
    permissions: CommunityPermission[],
  ): CommunityRole {
    this.assertCanManageRoles(actor);

    const role = this.membership.addRole(name, permissions);

    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );

    return role;
  }

  public updateRole(
    actor: IdentityId,
    roleId: CommunityRoleId,
    name: CommunityRoleName,
    permissions: CommunityPermission[],
  ): void {
    this.assertCanManageRoles(actor);
    this.membership.updateRole(roleId, name, permissions);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public deleteRole(actor: IdentityId, roleId: CommunityRoleId): void {
    this.assertCanManageRoles(actor);
    this.membership.deleteRole(roleId);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public assignRoles(
    actor: IdentityId,
    member: IdentityId,
    roleIds: CommunityRoleId[],
  ): void {
    this.assertCanManageRoles(actor);
    this.assertIsMember(member);
    this.membership.assignRoles(member, roleIds);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public banMember(actor: IdentityId, member: IdentityId): void {
    this.assertCanBanMembers(actor);
    assert(
      !this.ownerIdentityId.isEqual(member),
      new CommunityOwnerMismatchError(),
    );
    this.membership.ban(member);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public unbanMember(actor: IdentityId, member: IdentityId): void {
    this.assertCanBanMembers(actor);
    this.membership.unban(member);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public updateProfile(
    actor: IdentityId,
    name: CommunityName,
    description: CommunityDescription,
    avatar?: CommunityAvatar,
    banner?: CommunityBanner,
    discoverable?: boolean,
    autoJoinEnabled?: boolean,
  ): void {
    CommunityOwnerValidator.assertIsOwner(this.ownerIdentityId, actor);
    this.profile = new CommunityProfile(name, description, avatar, banner);

    if (discoverable !== undefined) {
      this.settings.updateDiscoverable(discoverable);
    }

    if (autoJoinEnabled !== undefined) {
      this.settings.updateAutoJoinEnabled(autoJoinEnabled);
    }

    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public getId(): CommunityId {
    return this.id;
  }

  public getOwnerIdentityId(): IdentityId {
    return this.ownerIdentityId;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getMemberIds(): IdentityId[] {
    return this.membership.getMemberIds();
  }

  public isMember(identityId: IdentityId): boolean {
    return this.membership.isMember(identityId);
  }

  public belongsToNetwork(networkId: NetworkId): boolean {
    return this.networkId.isEqual(networkId);
  }

  public isPublic(): boolean {
    return this.settings.isPublic();
  }

  public isAutoJoinEnabled(): boolean {
    return this.settings.isAutoJoinEnabled();
  }

  public isOwner(identityId: IdentityId): boolean {
    return this.ownerIdentityId.isEqual(identityId);
  }

  public hasMembers(): boolean {
    return this.membership.hasMembers();
  }

  public viewAsMember(identityId: IdentityId): void {
    this.assertIsMember(identityId);
  }

  public requestMembership(identityId: IdentityId): void {
    this.assertIsNotBanned(identityId);
  }

  public visibleChannelsFor(
    identityId: IdentityId,
  ): ReturnType<CommunityChannels['toPrimitives']> {
    return this.channels.visiblePrimitivesFor((permissions) => {
      if (this.isOwner(identityId)) {
        return true;
      }

      return this.membership.memberHasAnyRole(
        identityId,
        permissions.getVisibleRoleIds(),
      );
    });
  }

  public visibleTextChannelIdsFor(
    identityId: IdentityId,
  ): CommunityChannelId[] {
    this.assertIsMember(identityId);

    return this.channels.visibleTextChannelIdsFor((permissions) => {
      if (this.isOwner(identityId)) {
        return true;
      }

      return this.membership.memberHasAnyRole(
        identityId,
        permissions.getVisibleRoleIds(),
      );
    });
  }

  public visibleMembersForTextChannel(
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.assertHasTextChannel(channelId);

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
    CommunityPermissionValidator.assertHasPermission(
      this.ownerIdentityId,
      this.membership,
      identityId,
      CommunityPermission.CREATE_POLLS,
    );

    return this.visibleMembersForTextChannel(channelId);
  }

  public visibleMembersForTextChannelPollVote(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    this.assertCanViewTextChannel(identityId, channelId);

    return this.visibleMembersForTextChannel(channelId);
  }

  public toPrimitives() {
    const channels = this.channels.toPrimitives();
    const settings = this.settings.toPrimitives();

    return {
      autoJoinEnabled: settings.autoJoinEnabled,
      avatar: this.profile.getAvatar()?.valueOf(),
      bannedMemberIds: this.membership.toPrimitives().bannedMemberIds,
      banner: this.profile.getBanner()?.valueOf(),
      createdAt: settings.createdAt,
      description: this.profile.getDescription().valueOf(),
      discoverable: settings.discoverable,
      id: this.id.valueOf(),
      memberIds: this.membership.toPrimitives().memberIds,
      memberRoles: this.membership.toPrimitives().memberRoles,
      name: this.profile.getName().valueOf(),
      networkId: this.networkId.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      roles: this.membership.toPrimitives().roles,
      textChannels: channels.textChannels,
      visibility: settings.visibility,
      voiceChannels: channels.voiceChannels,
    };
  }
}
