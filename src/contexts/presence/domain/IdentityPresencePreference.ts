import { assert, Timestamp } from '@haskou/value-objects';

import { DisconnectedPresenceCannotBeSelectedError } from './errors/DisconnectedPresenceCannotBeSelectedError';
import { PresenceCustomMessage } from './value-objects/PresenceCustomMessage';
import { PresenceStatus } from './value-objects/PresenceStatus';

export class IdentityPresencePreference {
  public static fromPrimitives(
    selectedStatus: string,
    updatedAt: number,
    customMessage?: string,
  ): IdentityPresencePreference {
    return new IdentityPresencePreference(
      PresenceStatus.fromPrimitives(selectedStatus),
      new Timestamp(updatedAt),
      customMessage ? new PresenceCustomMessage(customMessage) : undefined,
    );
  }

  constructor(
    private selectedStatus: PresenceStatus,
    private updatedAt: Timestamp,
    private customMessage?: PresenceCustomMessage,
  ) {}

  public blocksDerivedStatus(): boolean {
    return this.selectedStatus.blocksDerivedStatus();
  }

  public clearCustomMessage(now: Timestamp): boolean {
    if (!this.customMessage) {
      return false;
    }

    this.customMessage = undefined;
    this.updatedAt = now;

    return true;
  }

  public mergeFrom(preference: IdentityPresencePreference): void {
    if (preference.updatedAt.isBefore(this.updatedAt)) {
      return;
    }

    this.selectedStatus = preference.selectedStatus;
    this.customMessage = preference.customMessage;
    this.updatedAt = preference.updatedAt;
  }

  public selected(): PresenceStatus {
    return this.selectedStatus;
  }

  public toPrimitives() {
    return {
      ...(this.customMessage
        ? { customMessage: this.customMessage.valueOf() }
        : {}),
      selectedStatus: this.selectedStatus.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }

  public update(
    status: PresenceStatus | undefined,
    customMessage: PresenceCustomMessage | undefined,
    customMessageWasProvided: boolean,
    now: Timestamp,
  ): boolean {
    const previousStatus = this.selectedStatus;
    const previousCustomMessage = this.customMessage;

    if (status) {
      assert(
        status.canBeSelected(),
        new DisconnectedPresenceCannotBeSelectedError(),
      );
      this.selectedStatus = status;
    }

    if (customMessageWasProvided) {
      this.customMessage = customMessage;
    }

    const changed =
      this.selectedStatus.isNotEqual(previousStatus) ||
      (customMessageWasProvided &&
        (previousCustomMessage?.isNotEqual(customMessage) ||
          previousCustomMessage !== customMessage));

    if (changed) {
      this.updatedAt = now;
    }

    return changed;
  }
}
