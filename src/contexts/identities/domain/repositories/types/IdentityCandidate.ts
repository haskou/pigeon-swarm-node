import { Identity } from '../../Identity';
import { IdentityExternalIdentifier } from '../../value-objects/IdentityExternalIdentifier';

export interface IdentityCandidate {
  externalIdentifier: IdentityExternalIdentifier;
  identity: Identity;
}
