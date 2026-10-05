import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../domain/Community';
import { CommunityOperation } from '../domain/operations/CommunityOperation';
import CommunityRepository from '../domain/repositories/CommunityRepository';
import { CommunityId } from '../domain/value-objects/CommunityId';
import LocalPrivateCommunityRepository from './local-db/LocalPrivateCommunityRepository';
import OrbitDBCommunityRepository from './orbitdb/OrbitDBCommunityRepository';

export default class CommunityRepositoryRouter extends CommunityRepository {
  public constructor(
    private readonly publicRepository: OrbitDBCommunityRepository,
    private readonly privateRepository: LocalPrivateCommunityRepository,
    private readonly authorizationRepository: PrivateAuthorizationRepository,
    private readonly storageCoordinator: PrivateAuthorizationStorageCoordinator,
  ) {
    super();
  }

  private async isProtected(id: CommunityId): Promise<boolean> {
    return Boolean(await this.authorizationRepository.findScope(id.valueOf()));
  }

  private async removeProtected(
    communities: Community[],
  ): Promise<Community[]> {
    return this.storageCoordinator.exclusivelyAll(
      communities.map((community) => community.getId().valueOf()),
      async () => {
        const protectedValues = await Promise.all(
          communities.map((community) => this.isProtected(community.getId())),
        );

        return communities.filter(
          (_community, index) => !protectedValues[index],
        );
      },
    );
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
    return this.storageCoordinator.exclusively(id.valueOf(), async () => {
      if (await this.isProtected(id)) {
        return this.privateRepository.findById(id);
      }

      return this.publicRepository.findById(id);
    });
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

  public findFrontier(id: CommunityId): Promise<string[]> {
    return this.storageCoordinator.exclusively(
      id.valueOf(),
      async (): Promise<string[]> =>
        (await this.isProtected(id))
          ? []
          : this.publicRepository.findFrontier(id),
    );
  }

  public async save(
    operation: CommunityOperation,
    proof: PublicMutationProof,
  ): Promise<void> {
    if (await this.isProtected(operation.getCommunityId())) {
      throw new InvalidPrivateAuthorizationError();
    }

    await this.publicRepository.save(operation, proof);
  }
}
