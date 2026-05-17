import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannels } from './CommunityChannels';
import { CommunityProfile } from './CommunityProfile';
import { CommunityTextChannel } from './CommunityTextChannel';
import { CommunityVoiceChannel } from './CommunityVoiceChannel';
import { CommunityMemberNotFoundError } from './errors/CommunityMemberNotFoundError';
import { CommunityOwnerCannotLeaveError } from './errors/CommunityOwnerCannotLeaveError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
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

export class Community extends AggregateRoot {
  public static create(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    name: CommunityName,
    description: CommunityDescription,
    avatar?: CommunityAvatar,
    banner?: CommunityBanner,
  ): Community {
    return new Community(
      CommunityId.generate(),
      networkId,
      ownerIdentityId,
      new CommunityProfile(name, description, avatar, banner),
      [ownerIdentityId],
      new CommunityChannels([], []),
      Timestamp.now(),
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
      primitives.memberIds.map((memberId) => new IdentityId(memberId)),
      new CommunityChannels(
        primitives.textChannels.map((channel) =>
          CommunityTextChannel.fromPrimitives(channel),
        ),
        (primitives.voiceChannels || []).map((channel) =>
          CommunityVoiceChannel.fromPrimitives(channel),
        ),
      ),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly id: CommunityId,
    private readonly networkId: NetworkId,
    private readonly ownerIdentityId: IdentityId,
    private profile: CommunityProfile,
    private readonly members: IdentityId[],
    private readonly channels: CommunityChannels,
    private readonly createdAt: Timestamp,
  ) {
    super();
  }

  private assertOwner(identityId: IdentityId): void {
    assert(
      this.ownerIdentityId.isEqual(identityId),
      new CommunityOwnerMismatchError(),
    );
  }

  private visibility(): 'private' {
    return 'private';
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
    if (this.isMember(member)) {
      return;
    }

    this.members.push(member);
    this.record(
      new CommunityMemberWasAddedEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
        identityId: member.valueOf(),
      }),
    );
  }

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.assertOwner(actor);
    this.join(member);
  }

  public joinWithInvite(member: IdentityId): void {
    this.join(member);
  }

  public assertCanCreateInvite(identityId: IdentityId): void {
    this.assertOwner(identityId);
  }

  public leave(member: IdentityId): void {
    this.assertIsMember(member);
    assert(
      !this.ownerIdentityId.isEqual(member) || this.members.length === 1,
      new CommunityOwnerCannotLeaveError(),
    );

    const memberIndex = this.members.findIndex((currentMember) =>
      currentMember.isEqual(member),
    );

    this.members.splice(memberIndex, 1);
    this.record(
      new CommunityMemberWasLeftEvent(this.id.valueOf(), {
        ...this.eventAttributes(),
        community: this.toPrimitives(),
        identityId: member.valueOf(),
      }),
    );
  }

  public addTextChannel(
    actor: IdentityId,
    name: CommunityChannelName,
  ): CommunityTextChannel {
    this.assertOwner(actor);

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
    this.assertOwner(actor);

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
    this.assertOwner(actor);
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
    this.assertOwner(actor);

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

  public updateProfile(
    actor: IdentityId,
    name: CommunityName,
    description: CommunityDescription,
    avatar?: CommunityAvatar,
    banner?: CommunityBanner,
  ): void {
    this.assertOwner(actor);
    this.profile = new CommunityProfile(name, description, avatar, banner);
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

  public isMember(identityId: IdentityId): boolean {
    return this.members.some((member) => member.isEqual(identityId));
  }

  public belongsToNetwork(networkId: NetworkId): boolean {
    return this.networkId.isEqual(networkId);
  }

  public isOwner(identityId: IdentityId): boolean {
    return this.ownerIdentityId.isEqual(identityId);
  }

  public assertIsMember(identityId: IdentityId): void {
    assert(this.isMember(identityId), new CommunityMemberNotFoundError());
  }

  public toPrimitives() {
    const channels = this.channels.toPrimitives();

    return {
      avatar: this.profile.getAvatar()?.valueOf(),
      banner: this.profile.getBanner()?.valueOf(),
      createdAt: this.createdAt.valueOf(),
      description: this.profile.getDescription().valueOf(),
      id: this.id.valueOf(),
      memberIds: this.members.map((member) => member.valueOf()),
      name: this.profile.getName().valueOf(),
      networkId: this.networkId.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      textChannels: channels.textChannels,
      visibility: this.visibility(),
      voiceChannels: channels.voiceChannels,
    };
  }
}
