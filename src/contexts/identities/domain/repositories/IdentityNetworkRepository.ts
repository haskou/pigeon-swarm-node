import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export default abstract class IdentityNetworkRepository {
  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<NetworkId[]>;
}
