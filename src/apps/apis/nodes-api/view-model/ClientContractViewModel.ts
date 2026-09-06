import { ClientContractResource } from '../resources/ClientContractResource';

export class ClientContractViewModel {
  public toResource(): ClientContractResource {
    return { apiVersion: 1, protocol: 'pigeon-swarm' };
  }
}
