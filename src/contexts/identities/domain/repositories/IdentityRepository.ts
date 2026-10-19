import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityCandidate } from '../IdentityCandidate';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../value-objects/ProfileHandle';

export default abstract class IdentityRepository {
  public abstract calculateExternalIdentifier(
    identity: Identity,
  ): Promise<IdentityExternalIdentifier>;

  public abstract save(identity: Identity): Promise<IdentityExternalIdentifier>;

  public abstract findById(id: IdentityId): Promise<Identity>;

  public abstract findCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]>;

  public abstract findFreshCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]>;

  public abstract findCandidateByExternalIdentifier(
    id: IdentityId,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<IdentityCandidate>;

  public abstract findCandidateByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityCandidate>;

  public abstract findByHandle(handle: ProfileHandle): Promise<Identity>;

  public abstract hasByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<boolean>;

  /**
   * Rejects with IdentityNotFoundError only when every network verifiably lacks the document.
   * Rejects with ReplicatedStateNotReadyError when any read could not complete.
   */
  public abstract requireByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity>;

  public abstract findCandidatesById(id: IdentityId): Promise<Identity[]>;

  /** Whether this node already stores a version of the identity; local only. */
  public abstract holds(id: IdentityId): Promise<boolean>;

  /**
   * Whether this node already stores exactly this version of the identity;
   * local only, never fetched from the network.
   */
  public abstract holdsVersion(
    id: IdentityId,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<boolean>;
}
