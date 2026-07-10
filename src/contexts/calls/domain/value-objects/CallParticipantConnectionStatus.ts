import { Enum } from '@haskou/value-objects';

const connectionStatuses = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as const;

export class CallParticipantConnectionStatus extends Enum<string> {
  public static readonly CONNECTED = new CallParticipantConnectionStatus(
    connectionStatuses.CONNECTED,
  );

  public static readonly DISCONNECTED = new CallParticipantConnectionStatus(
    connectionStatuses.DISCONNECTED,
  );

  public static fromPrimitives(value: string): CallParticipantConnectionStatus {
    return new CallParticipantConnectionStatus(value);
  }

  public getValues(): string[] {
    return Object.values(connectionStatuses);
  }

  public isConnected(): boolean {
    return this.isEqual(CallParticipantConnectionStatus.CONNECTED);
  }
}
