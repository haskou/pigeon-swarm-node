import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CommunityModerationLogEntry', () => {
  it('creates a community moderation action with a derived id', () => {
    const communityId = CommunityId.generate();
    const actorIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    );
    const channelId = CommunityChannelId.generate();
    const entry = CommunityModerationLogEntry.create(
      communityId,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        channelId,
      ),
      new CommunityModerationLogDetails({ name: 'general', type: 'text' }),
      new Timestamp(1780000000000),
    );

    expect(entry.toPrimitives()).toMatchObject({
      action: 'channel_created',
      actorIdentityId: actorIdentityId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: 1780000000000,
      details: { name: 'general', type: 'text' },
      id: CommunityModerationLogId.derive(
        communityId.valueOf(),
        actorIdentityId.valueOf(),
        'channel_created',
        'channel',
        channelId.valueOf(),
        1780000000000,
      ).valueOf(),
      target: {
        id: channelId.valueOf(),
        type: 'channel',
      },
    });
  });
});
