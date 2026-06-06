import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityProfile } from '@app/contexts/communities/domain/entities/profile/CommunityProfile';
import { CommunitySettings } from '@app/contexts/communities/domain/entities/profile/CommunitySettings';
import { CommunityChannelWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityChannelWasCreatedEvent';
import { CommunityChannelWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelWasDeletedEvent';
import { CommunityChannelWasRenamedEvent } from '@app/contexts/communities/domain/events/CommunityChannelWasRenamedEvent';
import { CommunityMemberWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityMemberWasAddedEvent';
import { CommunityMemberWasLeftEvent } from '@app/contexts/communities/domain/events/CommunityMemberWasLeftEvent';
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from '@app/contexts/communities/domain/events/CommunityWasUpdatedEvent';
import { CommunityAvatar } from '@app/contexts/communities/domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '@app/contexts/communities/domain/value-objects/CommunityBanner';
import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { CommunityVisibility } from '@app/contexts/communities/domain/value-objects/CommunityVisibility';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

describe('Community', () => {
  const owner = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const member = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

  it('records community creation metadata for realtime delivery', () => {
    const community = createCommunity();
    const events = community.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CommunityWasCreatedEvent);
    expect(events[0].attributes).toMatchObject({
      community: {
        id: community.getId().valueOf(),
        memberIds: [owner.valueOf()],
        name: 'Community',
        networkId: networkId.valueOf(),
        ownerIdentityId: owner.valueOf(),
      },
      communityId: community.getId().valueOf(),
      memberIds: [owner.valueOf()],
      networkId: networkId.valueOf(),
      ownerIdentityId: owner.valueOf(),
    });
  });

  it('records channel metadata events for members', () => {
    const community = createCommunity();
    community.pullDomainEvents();
    const channel = community.addTextChannel(
      owner,
      new CommunityChannelName('general'),
    );

    community.renameChannel(
      owner,
      channel.getId(),
      new CommunityChannelName('announcements'),
    );
    community.deleteChannel(owner, channel.getId());

    const events = community.pullDomainEvents();

    expect(events).toHaveLength(3);
    expect(events[0]).toBeInstanceOf(CommunityChannelWasCreatedEvent);
    expect(events[0].attributes).toMatchObject({
      channel: {
        id: channel.getId().valueOf(),
        name: 'general',
        type: 'text',
      },
      communityId: community.getId().valueOf(),
      memberIds: [owner.valueOf()],
      networkId: networkId.valueOf(),
    });
    expect(events[1]).toBeInstanceOf(CommunityChannelWasRenamedEvent);
    expect(events[1].attributes).toMatchObject({
      channelId: channel.getId().valueOf(),
      name: 'announcements',
    });
    expect(events[2]).toBeInstanceOf(CommunityChannelWasDeletedEvent);
    expect(events[2].attributes).toMatchObject({
      channelId: channel.getId().valueOf(),
    });
  });

  it('records voice channel creation with empty connected identities', () => {
    const community = createCommunity();
    community.pullDomainEvents();
    const channel = community.addVoiceChannel(
      owner,
      new CommunityChannelName('voice'),
    );
    const event = community.pullDomainEvents()[0];

    expect(event).toBeInstanceOf(CommunityChannelWasCreatedEvent);
    expect(event.attributes).toMatchObject({
      channel: {
        connectedIdentityIds: [],
        id: channel.getId().valueOf(),
        name: 'voice',
        type: 'voice',
      },
    });
  });

  it('records member and profile metadata events', () => {
    const community = createCommunity();
    community.pullDomainEvents();

    community.addMember(owner, member);
    community.updateProfile(
      owner,
      new CommunityName('Renamed'),
      new CommunityDescription('Updated description'),
      new CommunityAvatar('bafybeigavatar'),
      new CommunityBanner('bafybeigbanner'),
    );

    const events = community.pullDomainEvents();

    expect(events[0]).toBeInstanceOf(CommunityMemberWasAddedEvent);
    expect(events[0].attributes).toMatchObject({
      community: {
        id: community.getId().valueOf(),
        memberIds: [owner.valueOf(), member.valueOf()],
      },
      identityId: member.valueOf(),
      memberIds: [owner.valueOf(), member.valueOf()],
    });
    expect(events[1]).toBeInstanceOf(CommunityWasUpdatedEvent);
    expect(events[1].attributes).toMatchObject({
      community: {
        avatar: 'bafybeigavatar',
        banner: 'bafybeigbanner',
        description: 'Updated description',
        id: community.getId().valueOf(),
        memberIds: [owner.valueOf(), member.valueOf()],
        name: 'Renamed',
      },
      memberIds: [owner.valueOf(), member.valueOf()],
    });
  });

  it('records member leave metadata events', () => {
    const community = createCommunity();
    community.pullDomainEvents();

    community.addMember(owner, member);
    community.pullDomainEvents();
    community.leave(member);

    const events = community.pullDomainEvents();

    expect(events[0]).toBeInstanceOf(CommunityMemberWasLeftEvent);
    expect(events[0].attributes).toMatchObject({
      community: {
        id: community.getId().valueOf(),
        memberIds: [owner.valueOf()],
      },
      identityId: member.valueOf(),
      memberIds: [owner.valueOf()],
    });
  });

  it('allows the owner to leave when they are the only member', () => {
    const community = createCommunity();

    community.leave(owner);

    expect(community.toPrimitives().memberIds).toEqual([]);
  });

  it('allows the owner to kick a member without banning them', () => {
    const community = createCommunity();
    community.pullDomainEvents();

    community.addMember(owner, member);
    community.pullDomainEvents();
    community.kickMember(owner, member);

    const events = community.pullDomainEvents();

    expect(community.toPrimitives()).toMatchObject({
      bannedMemberIds: [],
      memberIds: [owner.valueOf()],
    });
    expect(events[0]).toBeInstanceOf(CommunityMemberWasLeftEvent);
    expect(events[0].attributes).toMatchObject({
      actorIdentityId: owner.valueOf(),
      identityId: member.valueOf(),
    });
  });

  it('does not allow the owner to leave while other members remain', () => {
    const community = createCommunity();

    community.addMember(owner, member);

    expect(() => community.leave(owner)).toThrow(
      'Community owner cannot leave the community',
    );
  });

  it('allows channel members to vote in polls without create poll permission', () => {
    const community = createCommunity();
    const channel = community.addTextChannel(
      owner,
      new CommunityChannelName('polls'),
    );

    community.addMember(owner, member);

    expect(() => community.assertCanVotePoll(member, channel.getId())).not.toThrow();
    expect(() => community.assertCanCreatePoll(member, channel.getId())).toThrow(
      'Community permission denied: create_polls',
    );
  });

  it('keeps community visibility as immutable settings', () => {
    const community = Community.create(
      owner,
      networkId,
      new CommunityProfile(
        new CommunityName('Community'),
        new CommunityDescription('Public community'),
      ),
      CommunitySettings.create(true, CommunityVisibility.PUBLIC),
    );

    community.updateProfile(
      owner,
      new CommunityName('Renamed'),
      new CommunityDescription('Updated description'),
      undefined,
      undefined,
    );

    expect(community.toPrimitives().visibility).toBe('public');
  });

  it('updates auto join as community settings', () => {
    const community = createCommunity();

    community.updateProfile(
      owner,
      new CommunityName('Renamed'),
      new CommunityDescription('Updated description'),
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(community.isAutoJoinEnabled()).toBe(true);
    expect(community.toPrimitives().autoJoinEnabled).toBe(true);
  });

  function createCommunity(): Community {
    return Community.create(
      owner,
      networkId,
      new CommunityProfile(
        new CommunityName('Community'),
        new CommunityDescription('Private community'),
      ),
      CommunitySettings.create(true),
    );
  }
});
