import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityAccessValidator } from './asserts/CommunityAccessValidator';
import { CommunityOwnerValidator } from './asserts/CommunityOwnerValidator';
import { CommunityChannelMessageMentions } from './CommunityChannelMessageMentions';
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
import { CommunityOwnerCannotBeKickedError } from './errors/CommunityOwnerCannotBeKickedError';
import { CommunityOwnerCannotLeaveError } from './errors/CommunityOwnerCannotLeaveError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
import { CommunityPermissionDeniedError } from './errors/CommunityPermissionDeniedError';
import { CommunityRequestActorMismatchError } from './errors/CommunityRequestActorMismatchError';
import { CommunityChannelMessageWasDeletedEvent } from './events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelMessageWasEditedEvent } from './events/CommunityChannelMessageWasEditedEvent';
import { CommunityChannelMessageWasSentEvent } from './events/CommunityChannelMessageWasSentEvent';
import { CommunityChannelWasCreatedEvent } from './events/CommunityChannelWasCreatedEvent';
import { CommunityChannelWasDeletedEvent } from './events/CommunityChannelWasDeletedEvent';
import { CommunityChannelWasRenamedEvent } from './events/CommunityChannelWasRenamedEvent';
import { CommunityInviteWasAcceptedEvent } from './events/CommunityInviteWasAcceptedEvent';
import { CommunityInviteWasCreatedEvent } from './events/CommunityInviteWasCreatedEvent';
import { CommunityMemberWasAddedEvent } from './events/CommunityMemberWasAddedEvent';
import { CommunityMemberWasLeftEvent } from './events/CommunityMemberWasLeftEvent';
import { CommunityWasCreatedEvent } from './events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from './events/CommunityWasUpdatedEvent';
import { CommunityAvatar } from './value-objects/CommunityAvatar';
import { CommunityBanner } from './value-objects/CommunityBanner';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from './value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityChannelName } from './value-objects/CommunityChannelName';
import { CommunityChannelType } from './value-objects/CommunityChannelType';
import { CommunityDescription } from './value-objects/CommunityDescription';
import { CommunityId } from './value-objects/CommunityId';
import { CommunityInviteMaxUses } from './value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from './value-objects/CommunityInviteNonce';
import { CommunityJoinMethod } from './value-objects/CommunityJoinMethod';
import { CommunityModerationAction } from './value-objects/CommunityModerationAction';
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
    id: CommunityId = CommunityId.generate(),
  ): Community {
    const community = new Community(
      id,
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

  private assertInvitationResolvedByParty(
    author: IdentityId,
    request: CommunityMembershipRequest,
  ): void {
    const isInvitee = request.getIdentityId().isEqual(author);
    const isCreatorWithdrawing =
      request.isDeclined() && request.getCreatorIdentityId().isEqual(author);

    if (!isInvitee && !isCreatorWithdrawing) {
      throw new CommunityRequestActorMismatchError();
    }
  }

  private assertRequestResolvedByAuthorized(
    author: IdentityId,
    request: CommunityMembershipRequest,
  ): void {
    const validator = this.createAccessValidator();
    const isAutoJoinedRequester =
      request.isAccepted() &&
      this.isAutoJoinEnabled() &&
      request.getIdentityId().isEqual(author);

    if (isAutoJoinedRequester) {
      this.requestMembership(author);
    } else if (request.isAccepted()) {
      validator.assertCanApproveMembers(author);
    } else if (!request.getIdentityId().isEqual(author)) {
      validator.assertCanRejectMembers(author);
    }
  }

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.createAccessValidator().assertCanManageMembers(actor);
    this.join(member);
  }

  /**
   * Applies a member join authored by `author`. The join reference (invite,
   * invitation or request record) is verified when the operation is admitted;
   * here only the community state decides whether the author may join.
   */
  public joinAs(
    author: IdentityId,
    member: IdentityId,
    method: CommunityJoinMethod,
  ): void {
    const validator = this.createAccessValidator();

    if (method.isSelfJoin()) {
      assert(author.isEqual(member), new CommunityRequestActorMismatchError());
    }

    if (method.isEqual(CommunityJoinMethod.ADDED)) {
      validator.assertCanManageMembers(author);
    } else if (method.isEqual(CommunityJoinMethod.APPROVAL)) {
      validator.assertCanApproveMembers(author);
    } else if (method.isEqual(CommunityJoinMethod.AUTOMATIC)) {
      assert(
        this.isAutoJoinEnabled(),
        new CommunityPermissionDeniedError('auto_join'),
      );
    }

    this.join(member);
  }

  public createInvite(
    actor: IdentityId,
    nonce: CommunityInviteNonce,
    createdAt: Timestamp,
    expiresAt?: Timestamp,
    maxUses?: CommunityInviteMaxUses,
    encryptedCommunityKey?: EncryptedCommunityInviteKey,
  ): CommunityInvite {
    this.createAccessValidator().assertCanCreateInvite(actor);

    const invite = CommunityInvite.create(
      this.id,
      actor,
      nonce,
      createdAt,
      expiresAt,
      maxUses,
      encryptedCommunityKey,
    );
    this.record(
      new CommunityInviteWasCreatedEvent(invite.getToken().valueOf(), {
        communityId: this.id.valueOf(),
        invite: invite.toPrimitives(),
        networkId: this.networkId.valueOf(),
      }),
    );

    return invite;
  }

  public acceptInvite(
    member: IdentityId,
    acceptedInvite: CommunityInvite,
  ): void {
    this.record(
      new CommunityInviteWasAcceptedEvent(acceptedInvite.getToken().valueOf(), {
        communityId: this.id.valueOf(),
        identityId: member.valueOf(),
        invite: acceptedInvite.toPrimitives(),
        networkId: this.networkId.valueOf(),
      }),
    );
    this.join(member);
  }

  public inviteMember(
    actor: IdentityId,
    invitedIdentityId: IdentityId,
    createdAt: Timestamp,
  ): CommunityMembershipRequest {
    this.createAccessValidator().assertCanCreateInvite(actor);

    return CommunityMembershipRequest.invitation(
      this.id,
      actor,
      invitedIdentityId,
      createdAt,
      this.ownerIdentityId,
    );
  }

  public acceptMembershipRequest(
    actor: IdentityId,
    membershipRequest: CommunityMembershipRequest,
    updatedAt: Timestamp,
  ): void {
    if (membershipRequest.isRequest()) {
      this.createAccessValidator().assertCanApproveMembers(actor);
    }

    membershipRequest.accept(
      actor,
      membershipRequest.isRequest() ? actor : this.ownerIdentityId,
      updatedAt,
    );
    this.join(membershipRequest.getIdentityId());
  }

  public acceptMembershipRequestAutomatically(
    membershipRequest: CommunityMembershipRequest,
    updatedAt: Timestamp,
  ): void {
    membershipRequest.acceptAutomatically(this.ownerIdentityId, updatedAt);
    this.join(membershipRequest.getIdentityId());
  }

  public declineMembershipRequest(
    actor: IdentityId,
    membershipRequest: CommunityMembershipRequest,
    updatedAt: Timestamp,
  ): void {
    if (membershipRequest.isRequest()) {
      this.createAccessValidator().assertCanRejectMembers(actor);
    }

    membershipRequest.decline(
      actor,
      membershipRequest.isRequest() ? actor : this.ownerIdentityId,
      updatedAt,
    );
  }

  public sendChannelMessage(
    metadata: CommunityChannelMessageMetadata,
    payload: CommunityChannelMessagePayload,
    mentions: CommunityChannelMessageMentions,
    proof: PublicMutationProof,
  ): CommunityChannelMessage {
    const authorIdentityId = metadata.getAuthorIdentityId();
    const channelId = metadata.getChannelId();

    this.createAccessValidator().assertCanSendChannelMessage(
      authorIdentityId,
      channelId,
      payload,
      mentions,
    );

    const message = CommunityChannelMessage.create(metadata, payload, mentions);

    const primitives = message.toPrimitives();

    this.record(
      new CommunityChannelMessageWasSentEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        authorIdentityId: authorIdentityId.valueOf(),
        channelId: channelId.valueOf(),
        community: this.toPrimitives(),
        message: primitives,
        messageId: primitives.id,
        mutationProof: proof.toPrimitives(),
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
    proof: PublicMutationProof,
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
        mutationProof: proof.toPrimitives(),
      }),
    );

    return message;
  }

  public reactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    emoji: CommunityChannelMessageReactionEmoji,
    createdAt: Timestamp = Timestamp.now(),
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
      createdAt,
    );
  }

  public authorizeVoiceChannelCall(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanConnectVoice(identityId, channelId);
  }

  public deleteChannelMessage(
    actor: IdentityId,
    targetMessage: CommunityChannelMessage,
    channelId: CommunityChannelId,
    proof: PublicMutationProof,
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
        deletedByIdentityId: actor.valueOf(),
        mutationProof: proof.toPrimitives(),
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

  public viewChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanViewChannel(identityId, channelId);
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

  /** Whether `actor` may author a moderation log entry for `action`. */
  public assertCanRecordModerationAction(
    actor: IdentityId,
    action: CommunityModerationAction,
    details: Record<string, unknown>,
  ): void {
    this.createAccessValidator().assertCanRecordModerationAction(
      actor,
      action,
      details,
    );
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
    id?: CommunityChannelId,
    createdAt?: Timestamp,
  ): CommunityTextChannel {
    this.createAccessValidator().assertCanManageChannels(actor);

    const channel = this.channels.addText(name, id, createdAt);

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
    id?: CommunityChannelId,
    createdAt?: Timestamp,
  ): CommunityVoiceChannel {
    this.createAccessValidator().assertCanManageChannels(actor);

    const channel = this.channels.addVoice(name, id, createdAt);

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
  ): CommunityChannelType {
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
    id?: CommunityRoleId,
  ): CommunityRole {
    this.createAccessValidator().assertCanManageRoles(actor);

    const role = this.membership.addRole(name, permissions, id);

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

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public isIdentifiedBy(communityId: CommunityId): boolean {
    return this.id.isEqual(communityId);
  }

  public isMember(identityId: IdentityId): boolean {
    return this.membership.isMember(identityId);
  }

  public findIdentityUpdateRecipientsFor(identityId: IdentityId): IdentityId[] {
    return this.membership
      .getMemberIds()
      .filter((memberId) => memberId.isNotEqual(identityId));
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

  public isPrivateGenesisFor(
    communityId: CommunityId,
    ownerIdentityId: IdentityId,
  ): boolean {
    return (
      this.isIdentifiedBy(communityId) &&
      this.isOwner(ownerIdentityId) &&
      this.membership.hasOnlyMember(ownerIdentityId) &&
      !this.membership.hasBannedMembers() &&
      this.settings.isPrivate() &&
      !this.settings.isDiscoverable() &&
      !this.settings.isAutoJoinEnabled()
    );
  }

  public hasMembers(): boolean {
    return this.membership.hasMembers();
  }

  public viewAsMember(identityId: IdentityId): void {
    this.createAccessValidator().assertIsMember(identityId);
  }

  /**
   * Whether `author` may publish this exact state of a membership request.
   * Pending states are written by the creator; resolutions by whoever may
   * resolve it (requesters self-resolve only when auto-join is enabled).
   */
  public assertMembershipRequestAuthoredBy(
    author: IdentityId,
    request: CommunityMembershipRequest,
  ): void {
    const validator = this.createAccessValidator();

    if (request.isPending()) {
      if (!request.getCreatorIdentityId().isEqual(author)) {
        throw new CommunityRequestActorMismatchError();
      }

      if (request.isInvitation()) validator.assertCanCreateInvite(author);
      else this.requestMembership(author);

      return;
    }

    if (request.isInvitation()) {
      this.assertInvitationResolvedByParty(author, request);

      return;
    }

    this.assertRequestResolvedByAuthorized(author, request);
  }

  public assertCanCreateInvite(actor: IdentityId): void {
    this.createAccessValidator().assertCanCreateInvite(actor);
  }

  public requestMembership(identityId: IdentityId): void {
    this.createAccessValidator().assertIsNotBanned(identityId);
  }

  public createMembershipRequest(
    requesterIdentityId: IdentityId,
    createdAt: Timestamp,
  ): CommunityMembershipRequest {
    this.requestMembership(requesterIdentityId);

    return CommunityMembershipRequest.request(
      this.id,
      requesterIdentityId,
      createdAt,
      this.ownerIdentityId,
    );
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

  public authorizeTextChannelPollCreation(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanCreateTextChannelPoll(
      identityId,
      channelId,
    );
  }

  public authorizeTextChannelPollVote(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.createAccessValidator().assertCanVoteTextChannelPoll(
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
