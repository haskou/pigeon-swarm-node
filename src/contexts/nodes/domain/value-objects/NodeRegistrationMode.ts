import { Enum } from '@haskou/value-objects';

const registrationModes = {
  CLOSED: 'closed',
  CODES: 'codes',
  OPEN: 'open',
} as const;

/** Who may create a new identity through this node. */
export class NodeRegistrationMode extends Enum<string> {
  public static readonly OPEN = new NodeRegistrationMode(
    registrationModes.OPEN,
  );

  public static readonly CODES = new NodeRegistrationMode(
    registrationModes.CODES,
  );

  public static readonly CLOSED = new NodeRegistrationMode(
    registrationModes.CLOSED,
  );

  public static fromPrimitives(value: string): NodeRegistrationMode {
    return new NodeRegistrationMode(value);
  }

  public getValues(): string[] {
    return Object.values(registrationModes);
  }

  public isOpen(): boolean {
    return this.isEqual(NodeRegistrationMode.OPEN);
  }

  public isClosed(): boolean {
    return this.isEqual(NodeRegistrationMode.CLOSED);
  }
}
