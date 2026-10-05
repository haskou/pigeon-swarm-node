import { IsArray, IsInt, IsObject, IsString, Min } from 'class-validator';

/** The client-signed `communityOperations` put that carries a community change. */
export class CommunityOperationBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsString({ each: true })
  @IsArray()
  public readonly parents: string[];

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
