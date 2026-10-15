import { Identity } from '@app/contexts/identities/domain/Identity';

export class IdentityCreationDetectorMessage {
  constructor(public readonly identity: Identity) {}
}
