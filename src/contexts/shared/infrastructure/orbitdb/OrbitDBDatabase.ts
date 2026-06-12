import { OrbitDBEntry } from './OrbitDBEntry';

export type OrbitDBDatabase = {
  access?: {
    write?: string[];
  };
  add?(value: unknown): Promise<string>;
  address: string;
  all?(): Promise<Array<{ key?: string; value: unknown }>>;
  close(): Promise<void>;
  events: {
    on(event: 'update', handler: (entry: OrbitDBEntry) => void): void;
  };
  get?(key: string): Promise<{ key?: string; value: unknown } | unknown>;
  put?(
    keyOrDocument: string | Record<string, unknown>,
    value?: unknown,
  ): Promise<string>;
  query?(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<Array<Record<string, unknown>>>;
};
