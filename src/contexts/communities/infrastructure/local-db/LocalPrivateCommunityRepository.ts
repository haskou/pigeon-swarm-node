import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';

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
      return Community.fromPrimitives(
        projection as ReturnType<Community['toPrimitives']>,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
