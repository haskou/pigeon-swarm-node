import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  assert,
  PrimitiveOf,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { CommunityAccessValidator } from './asserts/CommunityAccessValidator';
import { CommunityOwnerValidator } from './asserts/CommunityOwnerValidator';
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
import { CommunityChannelMessageDeletion } from './entities/messages/CommunityChannelMessageDeletion';
import { CommunityChannelMessageEdition } from './entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMetadata } from './entities/messages/CommunityChannelMessageMetadata';
import { CommunityChannelMessagePayload } from './entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageReaction } from './entities/messages/CommunityChannelMessageReaction';
import { CommunityProfile } from './entities/profile/CommunityProfile';
import { CommunitySettings } from './entities/profile/CommunitySettings';
import { CommunityOwnerCannotBeKickedError } from './errors/CommunityOwnerCannotBeKickedError';
import { CommunityOwnerCannotLeaveError } from './errors/CommunityOwnerCannotLeaveError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
import { CommunityChannelMessageWasDeletedEvent } from './events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelMessageWasEditedEvent } from './events/CommunityChannelMessageWasEditedEvent';
import { CommunityChannelMessageWasSentEvent } from './events/CommunityChannelMessageWasSentEvent';
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

  private createAccessValidator(): CommunityAccessValidator {
    return new CommunityAccessValidator(
      this.ownerIdentityId,
      this.membership,
      this.channels,
      this.settings,
    );
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
    this.createAccessValidator().assertIsNotBanned(member);

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

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.createAccessValidator().assertCanManageMembers(actor);
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
    this.createAccessValidator().assertCanCreateInvite(actor);

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
    this.createAccessValidator().assertCanCreateInvite(actor);

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
      this.createAccessValidator().assertCanApproveMembers(actor);
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
      this.createAccessValidator().assertCanRejectMembers(actor);
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

    this.createAccessValidator().assertCanSendChannelMessage(
      authorIdentityId,
      channelId,
      payload,
      mentions,
    );

    const message = CommunityChannelMessage.create(
      metadata,
      payload,
      signature,
      attachmentExternalIdentifiers,
      mentions,
    );

    const primitives = message.toPrimitives();

    this.record(
      new CommunityChannelMessageWasSentEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        authorIdentityId: authorIdentityId.valueOf(),
        channelId: channelId.valueOf(),
        community: this.toPrimitives(),
        message: primitives,
        messageId: primitives.id,
      }),
    );

    return message;
  }

  public acceptSentChannelMessage(
    message: CommunityChannelMessage,
    payload: CommunityChannelMessagePayload,
  ): CommunityChannelMessage {
    const authorIdentityId = message.getAuthorIdentityId();

    this.createAccessValidator().assertCanSendChannelMessage(
      authorIdentityId,
      message.getChannelId(),
      payload,
      message.getMentions(),
    );

    return message;
  }

  public editChannelMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
    edition: CommunityChannelMessageEdition,
  ): CommunityChannelMessage {
    this.createAccessValidator().assertCanEditMessage(
      actor,
      targetMessage,
      channelId,
      edition.getPayload(),
      edition.getMentions(),
    );

    const message = edition.applyTo(targetMessage);
    const primitives = message.toPrimitives();

    this.record(
      new CommunityChannelMessageWasEditedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        authorIdentityId: actor.valueOf(),
        channelId: channelId.valueOf(),
        community: this.toPrimitives(),
        message: primitives,
        messageId: primitives.id,
      }),
    );

    return message;
  }

  public reactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    emoji: CommunityChannelMessageReactionEmoji,
  ): CommunityChannelMessageReaction {
    this.createAccessValidator().assertCanReactWithSticker(
      identityId,
      channelId,
    );

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
    this.createAccessValidator().assertCanConnectVoice(identityId, channelId);

    return this.getMemberIds();
  }

  public deleteChannelMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
    deletion: CommunityChannelMessageDeletion,
  ): void {
    this.createAccessValidator().assertCanDeleteMessage(
      actor,
      targetMessage,
      channelId,
    );

    this.record(
      new CommunityChannelMessageWasDeletedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        channelId: channelId.valueOf(),
        community: this.toPrimitives(),
        createdAt: deletion.getCreatedAt().valueOf(),
        deletedByIdentityId: actor.valueOf(),
        messageId: deletion.getId().valueOf(),
        signature: deletion.getSignature().valueOf(),
        targetMessageAuthorId: targetMessage.getAuthorIdentityId().valueOf(),
        targetMessageId: targetMessage.getId().valueOf(),
      }),
    );
  }

  public viewTextChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanViewTextChannel(
      identityId,
      channelId,
    );
  }

  public manageChannelMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanManageMessages(identityId, channelId);
  }

  public searchMessages(): void {
    this.createAccessValidator().assertCanSearchMessages();
  }

  public searchTextChannelMessages(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanViewTextChannel(
      identityId,
      channelId,
    );
    this.createAccessValidator().assertCanSearchMessages();
  }

  public viewModerationLog(identityId: IdentityId): void {
    this.createAccessValidator().assertCanViewModerationLog(identityId);
  }

  public leave(member: IdentityId): void {
    this.createAccessValidator().assertIsMember(member);
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
    this.createAccessValidator().assertCanManageMembers(actor);
    this.createAccessValidator().assertIsMember(member);
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
    this.createAccessValidator().assertCanManageChannels(actor);

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
    this.createAccessValidator().assertCanManageChannels(actor);

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
    this.createAccessValidator().assertCanManageChannels(actor);
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
    this.createAccessValidator().assertCanManageChannels(actor);

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
    this.createAccessValidator().assertCanManageChannels(actor);
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
    this.createAccessValidator().assertCanManageRoles(actor);

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
    this.createAccessValidator().assertCanManageRoles(actor);
    this.membership.updateRole(roleId, name, permissions);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public deleteRole(actor: IdentityId, roleId: CommunityRoleId): void {
    this.createAccessValidator().assertCanManageRoles(actor);
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
    this.createAccessValidator().assertCanManageRoles(actor);
    this.createAccessValidator().assertIsMember(member);
    this.membership.assignRoles(member, roleIds);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public banMember(actor: IdentityId, member: IdentityId): void {
    this.createAccessValidator().assertCanBanMembers(actor);
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
    this.createAccessValidator().assertCanBanMembers(actor);
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
    this.createAccessValidator().assertIsMember(identityId);
  }

  public requestMembership(identityId: IdentityId): void {
    this.createAccessValidator().assertIsNotBanned(identityId);
  }

  public visibleChannelsFor(
    identityId: IdentityId,
  ): ReturnType<CommunityChannels['toPrimitives']> {
    return this.createAccessValidator().visibleChannelsFor(identityId);
  }

  public visibleTextChannelIdsFor(
    identityId: IdentityId,
  ): CommunityChannelId[] {
    return this.createAccessValidator().visibleTextChannelIdsFor(identityId);
  }

  public visibleMembersForTextChannel(
    channelId: CommunityChannelId,
  ): IdentityId[] {
    const accessValidator = this.createAccessValidator();

    return accessValidator.visibleMembersForTextChannel(channelId);
  }

  public visibleMembersForTextChannelPollCreation(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    const accessValidator = this.createAccessValidator();

    return accessValidator.visibleMembersForTextChannelPollCreation(
      identityId,
      channelId,
    );
  }

  public visibleMembersForTextChannelPollVote(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): IdentityId[] {
    const accessValidator = this.createAccessValidator();

    return accessValidator.visibleMembersForTextChannelPollVote(
      identityId,
      channelId,
    );
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
