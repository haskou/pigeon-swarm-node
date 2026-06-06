import { Identity } from '../../Identity';
import { IdentityExternalIdentifier } from '../../value-objects/IdentityExternalIdentifier';

export type PreviousIdentityResolver = (
  externalIdentifier: IdentityExternalIdentifier,
) => Promise<Identity | undefined>;
