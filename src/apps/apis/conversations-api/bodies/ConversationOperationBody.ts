import { IsArray, IsInt, IsObject, IsString, Min } from 'class-validator';

/** The client-signed `conversationOperations` put that carries a conversation change. */
export class ConversationOperationBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsString({ each: true })
  @IsArray()
  public readonly parents: string[];

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
