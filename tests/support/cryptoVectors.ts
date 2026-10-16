import { readFileSync } from 'node:fs';

/** Loads a vector file shipped by @haskou/pigeon-swarm-crypto. */
export function cryptoVectors<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      require.resolve(`@haskou/pigeon-swarm-crypto/vectors/${name}.json`),
      'utf8',
    ),
  ) as T;
}
