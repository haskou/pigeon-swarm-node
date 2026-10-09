import { MLSRecordsFindMessage } from '@app/contexts/communities/application/find-mls-records/messages/MLSRecordsFindMessage';
import MLSRecordsFinder from '@app/contexts/communities/application/find-mls-records/MLSRecordsFinder';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityProfile } from '@app/contexts/communities/domain/entities/profile/CommunityProfile';
import { CommunitySettings } from '@app/contexts/communities/domain/entities/profile/CommunitySettings';
import { MLSRecord } from '@app/contexts/communities/domain/MLSRecord';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import MLSRecordRepository from '@app/contexts/communities/domain/repositories/MLSRecordRepository';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { MLSRecordId } from '@app/contexts/communities/domain/value-objects/MLSRecordId';
import { MLSRecordKind } from '@app/contexts/communities/domain/value-objects/MLSRecordKind';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

import { mallory } from '../../domain/operations/CommunityOperationFixtures';

describe('MLSRecordsFinder', () => {
  const owner = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const member = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const other = new IdentityId(
    'MCowBQYDK2VwAyEAh0nCGc0kCbsCm9jJDplJCPWx6S8Ad+ydnPoLYKcO3hg=',
  );
  let community: Community;
  let records: MLSRecord[];
  let finder: MLSRecordsFinder;

  function stored(
    payload: string,
    kind: string,
    epoch?: number,
    recipient?: IdentityId,
  ): MLSRecord {
    return new MLSRecord(
      MLSRecordId.derive({ epoch, groupId: 'g', kind, payload }),
      community.getId(),
      community.getId().valueOf(),
      new MLSRecordKind(kind),
      payload,
      owner,
      new Timestamp(1),
      epoch,
      recipient,
    );
  }

  function find(actor: IdentityId, kind?: string, afterEpoch?: number) {
    return finder.find(
      new MLSRecordsFindMessage(
        actor.valueOf(),
        community.getId().valueOf(),
        community.getId().valueOf(),
        kind,
        afterEpoch,
      ),
    );
  }

  beforeEach(() => {
    community = Community.create(
      owner,
      new NetworkId('550e8400-e29b-41d4-a716-446655440011'),
      new CommunityProfile(
        new CommunityName('Community'),
        new CommunityDescription('Private community'),
      ),
      CommunitySettings.create(true),
    );
    community.addMember(owner, member);
    community.addMember(owner, other);
    records = [
      stored('c2', 'commit', 2),
      stored('c1', 'commit', 1),
      stored('k', 'key_package'),
      stored('w-member', 'welcome', 1, member),
    ];
    const communities = mock<CommunityRepository>();
    const repository = mock<MLSRecordRepository>();
    communities.findById.mockResolvedValue(community);
    repository.findByCommunity.mockResolvedValue(records);
    finder = new MLSRecordsFinder(communities, repository);
  });

  it('orders commits by epoch', async () => {
    const found = await find(member, 'commit');

    expect(found.map((record) => record.payload)).toEqual(['c1', 'c2']);
  });

  it('only returns commits after the given epoch', async () => {
    const found = await find(member, 'commit', 1);

    expect(found.map((record) => record.payload)).toEqual(['c2']);
  });

  it('shows a welcome only to its recipient', async () => {
    expect((await find(member, 'welcome')).length).toBe(1);
    expect(await find(other, 'welcome')).toEqual([]);
    expect(await find(owner, 'welcome')).toEqual([]);
  });

  it('rejects an actor that is not a member', async () => {
    await expect(find(mallory, 'commit')).rejects.toThrow();
  });
});
