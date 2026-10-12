import { IsInt, IsString, Min } from 'class-validator';

export class DeviceCompromisedCredentialBody {
  @IsString()
  public readonly credential: string;

  @IsInt()
  @Min(0)
  public readonly compromisedSince: number;
}
