import { PrivateKey } from '@haskou/value-objects';

export class IPFSNetworkConfig {
  public static fromPrimitives(primitives: {
    id: string;
    name: string;
    key: string | undefined;
  }): IPFSNetworkConfig {
    return new IPFSNetworkConfig(
      primitives.id,
      primitives.name,
      primitives.key ? new PrivateKey(primitives.key) : undefined,
    );
  }

  constructor(
    private readonly id: string,
    private readonly name: string,
    private readonly key?: PrivateKey,
  ) {}

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getKey(): PrivateKey | undefined {
    return this.key;
  }

  public isPrivate(): boolean {
    return this.key !== undefined;
  }

  public toPrimitives() {
    return {
      id: this.id,
      key: this.key?.valueOf(),
      name: this.name,
    };
  }
}
