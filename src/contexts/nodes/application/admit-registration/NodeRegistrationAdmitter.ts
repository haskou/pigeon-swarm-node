import { Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCodeIsNotValidError } from '../../domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationIsClosedError } from '../../domain/errors/NodeRegistrationIsClosedError';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeRegistrationAdmitterMessage } from './messages/NodeRegistrationAdmitterMessage';
import { NodeRegistrationReservation } from './NodeRegistrationReservation';

/**
 * Applies the owner's registration mode to identity creation. In `codes` mode
 * it reserves one use of the presented code; the caller releases it when the
 * creation fails afterwards.
 */
export default class NodeRegistrationAdmitter {
  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly repository: NodeRegistrationCodeRepository,
  ) {}

  public async admit(
    message: NodeRegistrationAdmitterMessage,
  ): Promise<NodeRegistrationReservation> {
    if (!message.isCreation) {
      return NodeRegistrationReservation.none();
    }

    const mode = await this.nodeRepository.loadLocalNodeRegistrationMode();

    if (mode.isOpen()) {
      return NodeRegistrationReservation.none();
    }

    if (mode.isClosed()) {
      throw new NodeRegistrationIsClosedError();
    }

    const code = message.code
      ? await this.repository.reserveUse(message.code.hash(), Timestamp.now())
      : undefined;

    if (!code) {
      throw new NodeRegistrationCodeIsNotValidError();
    }

    return new NodeRegistrationReservation(code.getId());
  }

  public async release(
    reservation: NodeRegistrationReservation,
  ): Promise<void> {
    if (!reservation.codeId) {
      return;
    }

    await this.repository.releaseUse(reservation.codeId);
  }
}
