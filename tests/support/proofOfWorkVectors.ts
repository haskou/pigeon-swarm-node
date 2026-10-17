import { readFileSync } from 'node:fs';

export interface ProofOfWorkVector<Challenge> {
  challenge: Challenge;
  difficultyBits: number;
  minted?: boolean;
  name: string;
  nonce: unknown;
}

export interface ProofOfWorkVectorSet<Challenge> {
  accepted: ProofOfWorkVector<Challenge>[];
  domain: string;
  invalidChallenges: { challenge: Record<string, unknown>; name: string }[];
  rejected: ProofOfWorkVector<Challenge>[];
}

export interface ProofOfWorkVectors {
  identityAdmission: ProofOfWorkVectorSet<{
    identityId: string;
    networkIds: string[];
  }>;
  invalidDifficulties: unknown[];
  mailboxCreation: ProofOfWorkVectorSet<{
    mailboxId: string;
    postTokenHash: string;
    readTokenHash: string;
  }>;
}

/** The crypto library's shipped proof-of-work vectors, the single source of truth. */
export const proofOfWorkVectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/proof-of-work.json'),
    'utf8',
  ),
) as ProofOfWorkVectors;
