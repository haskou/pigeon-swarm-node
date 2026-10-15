import { Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCode } from '../../domain/NodeRegistrationCode';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';

export default class NodeRegistrationCodesFinder {
  constructor(private readonly repository: NodeRegistrationCodeRepository) {}

  /** Lists the usable codes and drops the expired and used-up ones. */
  public async find(): Promise<NodeRegistrationCode[]> {
    const now = Timestamp.now();
    const codes = await this.repository.findAll();
    const usable: NodeRegistrationCode[] = [];

    for (const code of codes) {
      if (code.isUsableAt(now)) {
        usable.push(code);
        continue;
      }

      await this.repository.remove(code.getId());
    }

    return usable;
  }
}
