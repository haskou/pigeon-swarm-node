import { ClientContractResource } from '../resources/ClientContractResource';

export class ClientContractViewModel {
  public toResource(): ClientContractResource {
    return { apiVersion: 2, protocol: 'pigeon-swarm' };
  }
}
