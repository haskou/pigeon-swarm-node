import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../value-objects/ProfileHandle';
import { IdentityMetadataRecord } from './types/IdentityMetadataRecord';

export default abstract class IdentityMetadataRepository {
  public abstract deleteByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void>;

  public abstract findAll(): Promise<IdentityMetadataRecord[]>;

  public abstract findByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityMetadataRecord[]>;

  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityMetadataRecord[]>;

  public abstract findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<IdentityMetadataRecord[]>;

  public abstract save(
    identity: Identity,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void>;
}
