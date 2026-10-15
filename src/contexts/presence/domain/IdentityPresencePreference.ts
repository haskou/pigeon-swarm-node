import { assert, Timestamp } from '@haskou/value-objects';

import { DisconnectedPresenceCannotBeSelectedError } from './errors/DisconnectedPresenceCannotBeSelectedError';
import { PresenceStatus } from './value-objects/PresenceStatus';

export class IdentityPresencePreference {
  public static fromPrimitives(
    selectedStatus: string,
    updatedAt: number,
  ): IdentityPresencePreference {
    return new IdentityPresencePreference(
      PresenceStatus.fromPrimitives(selectedStatus),
      new Timestamp(updatedAt),
    );
  }

  constructor(
    private selectedStatus: PresenceStatus,
    private updatedAt: Timestamp,
  ) {}

  public blocksDerivedStatus(): boolean {
    return this.selectedStatus.blocksDerivedStatus();
  }

  public selected(): PresenceStatus {
    return this.selectedStatus;
  }

  public toPrimitives() {
    return {
      selectedStatus: this.selectedStatus.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }

  public update(status: PresenceStatus | undefined, now: Timestamp): boolean {
    const previousStatus = this.selectedStatus;

    if (status) {
      assert(
        status.canBeSelected(),
        new DisconnectedPresenceCannotBeSelectedError(),
      );
      this.selectedStatus = status;
    }

    const changed = this.selectedStatus.isNotEqual(previousStatus);

    if (changed) {
      this.updatedAt = now;
    }

    return changed;
  }
}
