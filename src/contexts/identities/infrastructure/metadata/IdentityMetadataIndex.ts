import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Identity } from '../../domain/Identity';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../domain/value-objects/ProfileHandle';
import { IdentityMetadataRecord } from './IdentityMetadataRecord';

export default abstract class IdentityMetadataIndex {
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
