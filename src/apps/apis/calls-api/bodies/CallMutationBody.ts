import { IsInt, IsObject, Min } from 'class-validator';

/** Signed call participant or end record the client authored for this request. */
export class CallMutationBody {
  @IsInt()
  @Min(0)
  public readonly at: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
