import { Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCode } from '../../domain/NodeRegistrationCode';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';

export default class NodeRegistrationCodesFinder {
  constructor(private readonly repository: NodeRegistrationCodeRepository) {}

  /**
   * Lists the usable codes and drops the expired ones. Used-up codes are kept
   * until they expire: a use reserved by a failing creation comes back.
   */
  public async find(): Promise<NodeRegistrationCode[]> {
    const now = Timestamp.now();

    await this.repository.removeExpired(now);

    return (await this.repository.findAll()).filter((code) =>
      code.isUsableAt(now),
    );
  }
}
