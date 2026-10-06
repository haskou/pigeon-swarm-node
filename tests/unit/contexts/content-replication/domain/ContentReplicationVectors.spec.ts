import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Vector {
  name: string;
  payload: { cid: string; id: string; networkId: string };
  proofBody: Record<string, unknown>;
  signingContent: string;
}

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../fixtures/content-replication-vectors.json'),
    'utf8',
  ),
) as { recordId: string; vectors: Vector[] };

describe('content replication contract vectors', () => {
  it.each(fixture.vectors.map((vector) => [vector.name, vector] as const))(
    '%s reproduces its id, digest and signing content',
    (_name, vector) => {
      expect(vector.payload.id).toBe(fixture.recordId);
      expect(
        ContentReplication.idOf(vector.payload.networkId, vector.payload.cid),
      ).toBe(vector.payload.id);
      expect(vector.proofBody.payloadDigest).toBe(
        PublicMutationProof.digestOf(vector.payload),
      );
      expect(
        Buffer.from(
          PublicMutationProof.signingContentOf(vector.proofBody as never),
        ).toString('utf8'),
      ).toBe(vector.signingContent);
    },
  );
});
