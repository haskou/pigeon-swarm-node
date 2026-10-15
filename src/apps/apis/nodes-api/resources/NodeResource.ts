import { NodeRegistrationResource } from './NodeRegistrationResource';

export type NodeResource = {
  id: string;
  owner?: string;
  registration: NodeRegistrationResource;
};
