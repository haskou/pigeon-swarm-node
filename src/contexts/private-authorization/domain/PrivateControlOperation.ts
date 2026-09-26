import { PrivateControlOperationPrimitives } from './PrivateControlOperationPrimitives';

export class PrivateControlOperation {
  public static fromPrimitives(
    primitives: PrivateControlOperationPrimitives,
  ): PrivateControlOperation {
    return new PrivateControlOperation(primitives);
  }

  private constructor(
    private readonly primitives: PrivateControlOperationPrimitives,
  ) {}

  public toPrimitives(): PrivateControlOperationPrimitives {
    return {
      ...this.primitives,
      mutation: { ...this.primitives.mutation },
      previousOperationIds: [...this.primitives.previousOperationIds],
    };
  }
}
