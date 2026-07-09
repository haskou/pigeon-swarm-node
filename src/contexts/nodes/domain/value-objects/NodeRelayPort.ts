import { assert, Integer } from '@haskou/value-objects';

import { InvalidNodeRelayPortError } from '../errors/InvalidNodeRelayPortError';

export class NodeRelayPort extends Integer {
  private static readonly MAX_PORT = 65535;
  private static readonly MIN_PORT = 1;

  constructor(value: number | Integer) {
    super(value);

    assert(this.isValid(), new InvalidNodeRelayPortError(this.valueOf()));
  }

  private isValid(): boolean {
    return (
      this.isGreaterOrEqualThan(NodeRelayPort.MIN_PORT) &&
      this.isLessOrEqualThan(NodeRelayPort.MAX_PORT)
    );
  }

  public isBefore(port: NodeRelayPort): boolean {
    return this.isLessThan(port);
  }
}
