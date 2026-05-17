import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IdentityPresenceViewModel } from './IdentityPresenceViewModel';

export class IdentityPresencesViewModel {
  constructor(
    private readonly presences: IdentityPresence[],
    private readonly viewerIdentityId: IdentityId,
  ) {}

  public toResource(): object[] {
    return this.presences.map((presence) =>
      new IdentityPresenceViewModel(
        presence,
        this.viewerIdentityId,
      ).toResource(),
    );
  }
}
