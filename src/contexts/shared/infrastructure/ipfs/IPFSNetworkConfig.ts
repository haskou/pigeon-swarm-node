import { Password } from '@app/contexts/shared/domain/value-objects/Password';

export class IPFSNetworkConfig {
  public static fromPrimitives(primitives: {
    name: string;
    key: string | undefined;
  }): IPFSNetworkConfig {
    return new IPFSNetworkConfig(
      primitives.name,
      primitives.key ? new Password(primitives.key) : undefined,
    );
  }

  constructor(
    private readonly name: string,
    private readonly key?: Password,
  ) {}

  public getName(): string {
    return this.name;
  }

  public getKey(): Password | undefined {
    return this.key;
  }

  public isPrivate(): boolean {
    return this.key !== undefined;
  }

  public toPrimitives(): { name: string; key: string | undefined } {
    return {
      key: this.key?.valueOf(),
      name: this.name,
    };
  }
}
