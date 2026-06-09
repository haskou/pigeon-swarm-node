import { OrbitDBDatabase } from './OrbitDBDatabase';

export type OrbitDBInstance = {
  identity: {
    id: string;
  };
  open(
    address: string,
    options?: Record<string, unknown>,
  ): Promise<OrbitDBDatabase>;
  stop(): Promise<void>;
};
