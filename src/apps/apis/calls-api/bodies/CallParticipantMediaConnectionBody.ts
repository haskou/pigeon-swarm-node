import { IsEnum, IsOptional, IsString } from 'class-validator';

enum IceCandidateType {
  HOST = 'host',
  PRFLX = 'prflx',
  RELAY = 'relay',
  SRFLX = 'srflx',
}

enum MediaConnectionState {
  CLOSED = 'closed',
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  NEW = 'new',
}

export class CallParticipantMediaConnectionBody {
  @IsOptional()
  @IsEnum(IceCandidateType)
  public readonly localCandidateType?: string;

  @IsOptional()
  @IsString()
  public readonly protocol?: string;

  @IsOptional()
  @IsString()
  public readonly relayProtocol?: string;

  @IsOptional()
  @IsString()
  public readonly relayUrl?: string;

  @IsOptional()
  @IsEnum(IceCandidateType)
  public readonly remoteCandidateType?: string;

  @IsString()
  public readonly remoteIdentityId: string;

  @IsEnum(MediaConnectionState)
  public readonly state: string;
}
