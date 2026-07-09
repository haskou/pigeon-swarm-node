import { CallParticipantMediaConnection } from '../CallParticipantMediaConnection';

export class CallParticipantLeaseWasUpdatedAttributes {
  [key: string]: unknown;

  public readonly callId!: string;
  public readonly connectionChanged!: boolean;
  public readonly lastHeartbeatAt!: number;
  public readonly mediaConnections!: ReturnType<
    CallParticipantMediaConnection['toPrimitives']
  >[];

  public readonly mediaConnectionsChanged!: boolean;
  public readonly networkId!: string;
  public readonly ownerNodeId!: string;
  public readonly participantIds!: string[];
  public readonly participantIdentityId!: string;
  public readonly status!: string;
}
