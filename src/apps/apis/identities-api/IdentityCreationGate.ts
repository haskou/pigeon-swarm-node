import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import { IdentityCreationDetectorMessage } from '@app/contexts/identities/application/detect-creation/messages/IdentityCreationDetectorMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { NodeRegistrationAdmitterMessage } from '@app/contexts/nodes/application/admit-registration/messages/NodeRegistrationAdmitterMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationIsClosedError } from '@app/contexts/nodes/domain/errors/NodeRegistrationIsClosedError';
import { KeyedSerialQueue } from '@app/shared/infrastructure/concurrency/KeyedSerialQueue';

import { IdentityCreationIsRefusedOnThisNodeError } from './errors/IdentityCreationIsRefusedOnThisNodeError';

/**
 * The node's registration control for every identity publication, POST or
 * PUT: one that creates an identity this node does not hold yet needs the
 * node's admission. One publication per identity runs at a time, from the
 * creation check to the publish (or the release of its registration code
 * use), so concurrent creations of one identity are one creation: the next
 * sees the identity held and spends no code use.
 */
export default class IdentityCreationGate {
  private readonly queue = new KeyedSerialQueue();

  constructor(
    private readonly creationDetector: IdentityCreationDetector,
    private readonly registrationAdmitter: NodeRegistrationAdmitter,
  ) {}

  private async admit(
    identity: Identity,
    registrationCode: string | undefined,
  ): Promise<NodeRegistrationReservation> {
    const isCreation = await this.creationDetector.isCreation(
      new IdentityCreationDetectorMessage(identity),
    );

    try {
      return await this.registrationAdmitter.admit(
        new NodeRegistrationAdmitterMessage(isCreation, registrationCode),
      );
    } catch (error: unknown) {
      if (
        error instanceof NodeRegistrationIsClosedError ||
        error instanceof NodeRegistrationCodeIsNotValidError
      ) {
        throw new IdentityCreationIsRefusedOnThisNodeError(error.message);
      }

      throw error;
    }
  }

  /**
   * Whether a failed creation left the identity unsaved. A failure after the
   * save (charge, event publish) still created it, and a failing check is
   * treated as created, so the code use stays spent either way.
   */
  private async isStillNotCreated(identity: Identity): Promise<boolean> {
    try {
      return await this.creationDetector.isCreation(
        new IdentityCreationDetectorMessage(identity),
      );
    } catch {
      return false;
    }
  }

  /**
   * Admits the publication of `identity` and runs `publish`. A creation the
   * node refuses throws `IdentityCreationIsRefusedOnThisNodeError` before
   * `publish` runs; a creation that fails before the save gives its code use
   * back. `publish` must not publish the same identity again: the nested
   * call throws `KeyedSerialSectionIsNestedError` at once.
   */
  public async publish<T>(
    identity: Identity,
    registrationCode: string | undefined,
    publish: () => Promise<T>,
  ): Promise<T> {
    return this.queue.run(identity.getId().valueOf(), async () => {
      const reservation = await this.admit(identity, registrationCode);

      try {
        return await publish();
      } catch (error: unknown) {
        if (await this.isStillNotCreated(identity)) {
          await this.registrationAdmitter.release(reservation);
        }

        throw error;
      }
    });
  }
}
