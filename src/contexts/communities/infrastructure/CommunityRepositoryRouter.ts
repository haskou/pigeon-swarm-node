import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../domain/Community';
import CommunityRepository from '../domain/repositories/CommunityRepository';
import { CommunityId } from '../domain/value-objects/CommunityId';
import LocalPrivateCommunityRepository from './local-db/LocalPrivateCommunityRepository';
import OrbitDBCommunityRepository from './orbitdb/OrbitDBCommunityRepository';

export default class CommunityRepositoryRouter extends CommunityRepository {
  public constructor(
    private readonly publicRepository: OrbitDBCommunityRepository,
    private readonly privateRepository: LocalPrivateCommunityRepository,
    private readonly authorizationRepository: PrivateAuthorizationRepository,
  ) {
    super();
  }

  private async isProtected(id: CommunityId): Promise<boolean> {
    return Boolean(await this.authorizationRepository.findScope(id.valueOf()));
  }

  private async removeProtected(
    communities: Community[],
  ): Promise<Community[]> {
    const protectedValues = await Promise.all(
      communities.map((community) => this.isProtected(community.getId())),
    );

    return communities.filter((_community, index) => !protectedValues[index]);
  }

  public async delete(community: Community): Promise<void> {
    if (await this.isProtected(community.getId())) {
      throw new InvalidPrivateAuthorizationError();
    }

    await this.publicRepository.delete(community);
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const protectedIds = (
      await this.authorizationRepository.findScopeIds()
    ).map((scopeId) => new CommunityId(scopeId));

    return this.removeProtected(
      await this.publicRepository.findDiscoverable(options, protectedIds),
    );
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    if (await this.isProtected(id)) {
      return this.privateRepository.findById(id);
    }

    return this.publicRepository.findById(id);
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const [unfilteredPublicCommunities, privateCommunities] = await Promise.all(
      [
        this.publicRepository.findByMember(identityId),
        this.privateRepository.findByMember(identityId),
      ],
    );
    const publicCommunities = await this.removeProtected(
      unfilteredPublicCommunities,
    );
    const communities = new Map(
      publicCommunities.map((community) => [
        community.getId().valueOf(),
        community,
      ]),
    );

    for (const community of privateCommunities) {
      communities.set(community.getId().valueOf(), community);
    }

    return [...communities.values()];
  }

  public async findSyncable(): Promise<Community[]> {
    return this.removeProtected(await this.publicRepository.findSyncable());
  }

  public async save(community: Community): Promise<void> {
    if (await this.isProtected(community.getId())) {
      throw new InvalidPrivateAuthorizationError();
    }

    await this.publicRepository.save(community);
  }
}
