import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationProjectionNotFoundError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationProjectionNotFoundError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../domain/Community';
import { CommunityPrimitivesShape } from '../../domain/CommunityPrimitivesShape';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { CommunityId } from '../../domain/value-objects/CommunityId';

export default class LocalPrivateCommunityRepository {
  public constructor(
    private readonly authorizationRepository: PrivateAuthorizationRepository,
  ) {}

  private async findProjectedCommunity(
    id: CommunityId,
  ): Promise<Community | undefined> {
    const projection = await this.authorizationRepository
      .requireProjection(id.valueOf())
      .catch((error: unknown): undefined => {
        if (error instanceof PrivateAuthorizationProjectionNotFoundError) {
          return undefined;
        }

        throw error;
      });

    if (!projection) return undefined;

    try {
      if (!CommunityPrimitivesShape.isCommunityPrimitives(projection)) {
        throw new InvalidPrivateAuthorizationError();
      }

      const community = Community.fromPrimitives(projection);

      if (!community.isIdentifiedBy(id)) {
        throw new InvalidPrivateAuthorizationError();
      }

      return community;
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public async requireById(id: CommunityId): Promise<Community> {
    const community = await this.findProjectedCommunity(id);

    if (!community) throw new CommunityNotFoundError();

    return community;
  }

  public async hasById(id: CommunityId): Promise<boolean> {
    return (await this.findProjectedCommunity(id)) !== undefined;
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const communities = await Promise.all(
      (await this.authorizationRepository.findScopeIds()).map((scopeId) =>
        this.findProjectedCommunity(new CommunityId(scopeId)),
      ),
    );

    return communities.filter(
      (community): community is Community =>
        community !== undefined && community.isMember(identityId),
    );
  }
}
