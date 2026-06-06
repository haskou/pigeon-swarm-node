import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

describe('CommunityModerationLogEntry', () => {
  it('records a community moderation action', () => {
    const communityId = CommunityId.generate();
    const actorIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    );
    const channelId = CommunityChannelId.generate();
    const entry = CommunityModerationLogEntry.record(
      communityId,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        channelId,
      ),
      new CommunityModerationLogDetails({ name: 'general', type: 'text' }),
    );

    expect(entry.toPrimitives()).toMatchObject({
      action: 'channel_created',
      actorIdentityId: actorIdentityId.valueOf(),
      communityId: communityId.valueOf(),
      details: { name: 'general', type: 'text' },
      target: {
        id: channelId.valueOf(),
        type: 'channel',
      },
    });
  });
});
