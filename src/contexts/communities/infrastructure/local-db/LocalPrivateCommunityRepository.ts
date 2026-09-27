import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../domain/Community';
import { CommunityId } from '../../domain/value-objects/CommunityId';

export default class LocalPrivateCommunityRepository {
  public constructor(
    private readonly authorizationRepository: PrivateAuthorizationRepository,
  ) {}

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const projection = await this.authorizationRepository.findProjection(
      id.valueOf(),
    );

    if (!projection) return undefined;

    try {
      const community = Community.fromPrimitives(
        projection as ReturnType<Community['toPrimitives']>,
      );

      if (!community.isIdentifiedBy(id)) {
        throw new InvalidPrivateAuthorizationError();
      }

      return community;
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const communities = await Promise.all(
      (await this.authorizationRepository.findScopeIds()).map((scopeId) =>
        this.findById(new CommunityId(scopeId)),
      ),
    );

    return communities.filter(
      (community): community is Community =>
        community !== undefined && community.isMember(identityId),
    );
  }
}
