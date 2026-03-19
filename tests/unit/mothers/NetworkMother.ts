import { Network } from '@app/contexts/nodes/domain/Network';
import { NetworkKey } from '@app/contexts/nodes/domain/value-objects/NetworkKey';
import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { generateKeyPairSync } from 'crypto';

const { privateKey } = generateKeyPairSync('ed25519');

const validPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

export class NetworkMother {
  public id: NetworkId = NetworkId.generate();
  public name: NetworkName = new NetworkName('public');
  public key?: NetworkKey;

  public withId(id: NetworkId): this {
    this.id = id;

    return this;
  }

  public withName(name: NetworkName): this {
    this.name = name;

    return this;
  }

  public withoutKey(): this {
    this.key = undefined;

    return this;
  }

  public withPrivateKey(key: NetworkKey = new NetworkKey(validPem)): this {
    this.key = key;

    return this;
  }

  public build(): Network {
    return new Network(this.id, this.name, this.key);
  }
}
