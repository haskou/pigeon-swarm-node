import { IsObject, IsString, MaxLength } from 'class-validator';

export class PostPrivateAuthorizationScopeBody {
  @IsObject()
  public readonly projection: Record<string, unknown>;

  @IsString()
  @MaxLength(1_398_102)
  public readonly protectedMlsState: string;

  @IsString()
  @MaxLength(262_144)
  public readonly signedGenesisJson: string;
}
