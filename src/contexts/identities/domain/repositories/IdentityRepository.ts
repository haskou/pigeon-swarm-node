import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../value-objects/ProfileHandle';
import { IdentityCandidate } from './types/IdentityCandidate';

export default abstract class IdentityRepository {
  public abstract save(identity: Identity): Promise<IdentityExternalIdentifier>;

  public abstract findById(id: IdentityId): Promise<Identity>;

  public abstract findCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]>;

  public abstract findCandidateByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityCandidate>;

  public abstract findByHandle(handle: ProfileHandle): Promise<Identity>;

  public abstract findByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity | undefined>;

  public abstract findCandidatesById(id: IdentityId): Promise<Identity[]>;
}
