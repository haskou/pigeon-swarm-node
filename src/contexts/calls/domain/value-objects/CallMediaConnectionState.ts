import { Enum } from '@haskou/value-objects';

const states = {
  CLOSED: 'closed',
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  NEW: 'new',
} as const;

export class CallMediaConnectionState extends Enum<string> {
  public static fromPrimitives(value: string): CallMediaConnectionState {
    return new CallMediaConnectionState(value);
  }

  public getValues(): string[] {
    return Object.values(states);
  }
}
