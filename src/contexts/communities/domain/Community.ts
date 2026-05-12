import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityProfile } from './CommunityProfile';
import { CommunityTextChannel } from './CommunityTextChannel';
import { CommunityChannelNotFoundError } from './errors/CommunityChannelNotFoundError';
import { CommunityMemberNotFoundError } from './errors/CommunityMemberNotFoundError';
import { CommunityOwnerMismatchError } from './errors/CommunityOwnerMismatchError';
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
      [],
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
      primitives.textChannels.map((channel) =>
        CommunityTextChannel.fromPrimitives(channel),
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
    private readonly textChannels: CommunityTextChannel[],
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

  public addMember(actor: IdentityId, member: IdentityId): void {
    this.assertOwner(actor);

    if (this.isMember(member)) {
      return;
    }

    this.members.push(member);
  }

  public addTextChannel(
    actor: IdentityId,
    name: CommunityChannelName,
  ): CommunityTextChannel {
    this.assertOwner(actor);

    const channel = CommunityTextChannel.create(name);

    this.textChannels.push(channel);

    return channel;
  }

  public renameTextChannel(
    actor: IdentityId,
    channelId: CommunityChannelId,
    name: CommunityChannelName,
  ): void {
    this.assertOwner(actor);
    const channel = this.textChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());
    channel?.rename(name);
  }

  public assertHasTextChannel(channelId: CommunityChannelId): void {
    const channel = this.textChannels.find((candidate) =>
      candidate.getId().isEqual(channelId),
    );

    assert(channel, new CommunityChannelNotFoundError());
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

  public assertIsMember(identityId: IdentityId): void {
    assert(this.isMember(identityId), new CommunityMemberNotFoundError());
  }

  public toPrimitives() {
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
      textChannels: this.textChannels.map((channel) => channel.toPrimitives()),
      visibility: 'private' as const,
    };
  }
}
