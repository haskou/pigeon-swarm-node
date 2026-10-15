import { NodeRegistrationCodeId } from '../../domain/value-objects/NodeRegistrationCodeId';

/** What an admission holds: the reserved use of a code, when one was needed. */
export class NodeRegistrationReservation {
  public static none(): NodeRegistrationReservation {
    return new NodeRegistrationReservation();
  }

  constructor(public readonly codeId?: NodeRegistrationCodeId) {}
}
