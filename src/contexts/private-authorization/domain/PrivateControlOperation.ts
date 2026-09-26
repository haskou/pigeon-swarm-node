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
      control: this.primitives.control
        ? { ...this.primitives.control }
        : undefined,
      mutation: { ...this.primitives.mutation },
      previousOperationIds: [...this.primitives.previousOperationIds],
    };
  }
}
