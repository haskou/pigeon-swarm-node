import { CommunityCreator } from '@app/contexts/communities/application/create-community/CommunityCreator';
import { CommunityCreateMessage } from '@app/contexts/communities/application/create-community/messages/CommunityCreateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRepository } from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

class InMemoryCommunityRepository implements CommunityRepository {
  public readonly savedCommunities: Community[] = [];

  public async delete(): Promise<void> {}

  public async findById(id: CommunityId): Promise<Community | undefined> {
    return this.savedCommunities.find((community) =>
      community.getId().isEqual(id),
    );
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    return this.savedCommunities.filter((community) =>
      community.isMember(identityId),
    );
  }

  public async findDiscoverable(): Promise<Community[]> {
    return this.savedCommunities;
  }

  public async save(community: Community): Promise<void> {
    this.savedCommunities.push(community);
  }
}

describe('CommunityCreator', () => {
  it('creates a private community owned by the authenticated identity', async () => {
    const ownerIdentityId =
      'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
    const repository = new InMemoryCommunityRepository();
    const community = await new CommunityCreator(repository).create(
      new CommunityCreateMessage(
        ownerIdentityId,
        '550e8400-e29b-41d4-a716-446655440000',
        'Codex crew',
        'Architecture refactor test community',
        'bagaaieraavatar',
        'bagaaierabanner',
      ),
    );

    expect(repository.savedCommunities).toEqual([community]);
    expect(community.isOwner(new IdentityId(ownerIdentityId))).toBe(true);
    expect(community.isMember(new IdentityId(ownerIdentityId))).toBe(true);
  });
});
