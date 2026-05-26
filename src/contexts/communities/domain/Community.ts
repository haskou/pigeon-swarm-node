import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { CommunityChannelMessageMention } from './CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from './CommunityChannelMessagePayload';
import { CommunityChannelPermissions } from './CommunityChannelPermissions';
import { CommunityChannels } from './CommunityChannels';
import { CommunityMembership } from './CommunityMembership';
import { CommunityProfile } from './CommunityProfile';
import { CommunityRole } from './CommunityRole';
import { CommunityRoles } from './CommunityRoles';
import { CommunitySettings } from './CommunitySettings';
import { CommunityTextChannel } from './CommunityTextChannel';
import { CommunityVoiceChannel } from './CommunityVoiceChannel';
import { CommunityMemberBannedError } from './errors/CommunityMemberBannedError';
import { CommunityMemberNotFoundError } from './errors/CommunityMemberNotFoundError';
import { CommunityMessageSearchUnavailableError } from './errors/CommunityMessageSearchUnavailableError';
import { CommunityOwnerCannotBeKickedError } from './errors/CommunityOwnerCannotBeKickedError';
import { CommunityOwnerCannotLeaveError } from './errors/CommunityOwnerCannotLeaveError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
import { CommunityPermissionDeniedError } from './errors/CommunityPermissionDeniedError';
import { CommunityChannelWasCreatedEvent } from './events/CommunityChannelWasCreatedEvent';
import { CommunityChannelWasDeletedEvent } from './events/CommunityChannelWasDeletedEvent';
import { CommunityChannelWasRenamedEvent } from './events/CommunityChannelWasRenamedEvent';
import { CommunityMemberWasAddedEvent } from './events/CommunityMemberWasAddedEvent';
import { CommunityMemberWasLeftEvent } from './events/CommunityMemberWasLeftEvent';
import { CommunityWasUpdatedEvent } from './events/CommunityWasUpdatedEvent';
import { CommunityAvatar } from './value-objects/CommunityAvatar';
import { CommunityBanner } from './value-objects/CommunityBanner';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelName } from './value-objects/CommunityChannelName';
import { CommunityDescription } from './value-objects/CommunityDescription';
import { CommunityId } from './value-objects/CommunityId';
import { CommunityName } from './value-objects/CommunityName';
import { CommunityPermission } from './value-objects/CommunityPermission';
import { CommunityRoleId } from './value-objects/CommunityRoleId';
import { CommunityRoleName } from './value-objects/CommunityRoleName';

export class Community extends AggregateRoot {
  public static create(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    profile: CommunityProfile,
    settings: CommunitySettings,
  ): Community {
    return new Community(
      CommunityId.generate(),
      networkId,
      ownerIdentityId,
      profile,
      CommunityMembership.create([ownerIdentityId], CommunityRoles.default()),
      new CommunityChannels([], []),
      settings,
    );
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

  private assertOwner(identityId: IdentityId): void {
    assert(
      this.ownerIdentityId.isEqual(identityId),
      new CommunityOwnerMismatchError(),
    );
  }

  private hasPermission(
    identityId: IdentityId,
    permission: CommunityPermission,
  ): boolean {
    return (
      this.isOwner(identityId) ||
      (this.isMember(identityId) &&
        this.membership.getRoles().memberHasPermission(identityId, permission))
    );
  }

  private assertPermission(
    identityId: IdentityId,
    permission: CommunityPermission,
  ): void {
    assert(
      this.hasPermission(identityId, permission),
      new CommunityPermissionDeniedError(permission.valueOf()),
    );
  }

  private assertCanAccessChannel(
    identityId: IdentityId,
    permissions: CommunityChannelPermissions,
  ): void {
    assert(
      this.isOwner(identityId) ||
        this.membership
          .getRoles()
          .memberHasAnyRole(identityId, permissions.getVisibleRoleIds()),
      new CommunityPermissionDeniedError(
        CommunityPermission.VIEW_CHANNELS.valueOf(),
      ),
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

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.assertCanManageMembers(actor);
    this.join(member);
  }

  public joinWithInvite(member: IdentityId): void {
    this.join(member);
  }

  public assertCanCreateInvite(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.CREATE_INVITES);
  }

  public assertCanApproveMembers(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.APPROVE_MEMBERS);
  }

  public assertCanRejectMembers(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.REJECT_MEMBERS);
  }

  public assertCanManageMembers(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.MANAGE_MEMBERS);
  }

  public assertCanViewModerationLog(identityId: IdentityId): void {
    this.assertCanManageMembers(identityId);
  }

  public assertCanManageChannels(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.MANAGE_CHANNELS);
  }

  public assertCanManageRoles(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.MANAGE_ROLES);
  }

  public assertCanCreatePoll(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertPermission(identityId, CommunityPermission.CREATE_POLLS);
  }

  public assertCanVotePoll(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
  }

  public assertCanBanMembers(identityId: IdentityId): void {
    this.assertPermission(identityId, CommunityPermission.BAN_MEMBERS);
  }

  public assertCanSendMessage(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanViewTextChannel(identityId, channelId);
    this.assertPermission(identityId, CommunityPermission.SEND_MESSAGES);
  }

  public assertCanViewTextChannel(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.assertHasTextChannel(channelId);
    this.assertCanAccessChannel(
      identityId,
      this.channels.textChannelPermissions(channelId),
    );
  }

  public assertCanReactWithSticker(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertCanSendMessage(identityId, channelId);
    this.assertPermission(identityId, CommunityPermission.SEND_STICKERS);
  }

  public assertCanMention(
    identityId: IdentityId,
    mentions: CommunityChannelMessageMention[],
  ): void {
    for (const mention of mentions) {
      if (mention.isEveryone()) {
        this.assertPermission(identityId, CommunityPermission.MENTION_EVERYONE);
      }

      if (mention.isHere()) {
        this.assertPermission(identityId, CommunityPermission.MENTION_HERE);
      }

      if (mention.isRole()) {
        this.assertPermission(identityId, CommunityPermission.MENTION_ROLES);
      }
    }
  }

  public assertCanUseMessagePayload(
    payload: CommunityChannelMessagePayload,
  ): void {
    payload.assertMatchesVisibility(this.settings.getVisibility());
  }

  public assertCanSearchMessages(): void {
    assert(
      this.settings.getVisibility().isPublic(),
      new CommunityMessageSearchUnavailableError(),
    );
  }

  public assertCanConnectVoice(
    identityId: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(identityId);
    this.assertHasVoiceChannel(channelId);
    this.assertCanAccessChannel(
      identityId,
      this.channels.voiceChannelPermissions(channelId),
    );
    this.assertPermission(identityId, CommunityPermission.CONNECT_VOICE);
  }

  public assertCanDeleteMessage(
    actor: IdentityId,
    targetAuthor: IdentityId,
    channelId: CommunityChannelId,
  ): void {
    this.assertIsMember(actor);
    this.assertHasTextChannel(channelId);

    if (actor.isEqual(targetAuthor)) {
      return;
    }

    this.assertPermission(actor, CommunityPermission.MANAGE_MESSAGES);
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

  public assertHasTextChannel(channelId: CommunityChannelId): void {
    this.channels.assertHasText(channelId);
  }

  public assertHasVoiceChannel(channelId: CommunityChannelId): void {
    this.channels.assertHasVoice(channelId);
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

    const role = this.membership.getRoles().add(name, permissions);

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
    this.membership.getRoles().update(roleId, name, permissions);
    this.record(
      new CommunityWasUpdatedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
      }),
    );
  }

  public deleteRole(actor: IdentityId, roleId: CommunityRoleId): void {
    this.assertCanManageRoles(actor);
    this.membership.getRoles().remove(roleId);
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
  ): void {
    this.assertOwner(actor);
    this.profile = new CommunityProfile(name, description, avatar, banner);

    if (discoverable !== undefined) {
      this.settings.updateDiscoverable(discoverable);
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
    return this.settings.getVisibility().isPublic();
  }

  public isOwner(identityId: IdentityId): boolean {
    return this.ownerIdentityId.isEqual(identityId);
  }

  public hasMembers(): boolean {
    return this.membership.hasMembers();
  }

  public assertIsMember(identityId: IdentityId): void {
    assert(this.isMember(identityId), new CommunityMemberNotFoundError());
  }

  public assertIsNotBanned(identityId: IdentityId): void {
    assert(
      !this.membership.isBanned(identityId),
      new CommunityMemberBannedError(),
    );
  }

  public visibleChannelsFor(
    identityId: IdentityId,
  ): ReturnType<CommunityChannels['toPrimitives']> {
    return this.channels.visiblePrimitivesFor((permissions) => {
      if (this.isOwner(identityId)) {
        return true;
      }

      return this.membership
        .getRoles()
        .memberHasAnyRole(identityId, permissions.getVisibleRoleIds());
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

      return this.membership
        .getRoles()
        .memberHasAnyRole(identityId, permissions.getVisibleRoleIds());
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

  public toPrimitives() {
    const channels = this.channels.toPrimitives();
    const settings = this.settings.toPrimitives();

    return {
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
