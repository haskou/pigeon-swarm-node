import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { MLSRecordId } from '@app/contexts/communities/domain/value-objects/MLSRecordId';
import { MLSRecordIdContent } from '@app/contexts/communities/domain/value-objects/MLSRecordIdContent';
import { MLSRecordDocumentId } from '@app/contexts/communities/infrastructure/orbitdb/MLSRecordDocumentId';
import MLSRecordMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/MLSRecordMutationPolicy';
import canonicalize from 'canonicalize';
import { mock } from 'jest-mock-extended';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Vectors = {
  cases: {
    derived: { canonical: string; documentId: string; recordId: string };
    input: MLSRecordIdContent;
    name: string;
  }[];
  communityId: string;
  distinct: { canonical: string; name: string; recordId: string }[];
};

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../fixtures/mls-record-id-vectors.json'),
    'utf8',
  ),
) as Vectors;

const AUTHOR = 'MCowBQYDK2VwAyEAA/wgW5GzeJmnvGBt2yZCsEOcMr6Q8fMmtwk4an4oUe4=';

describe('MLS record id vectors', () => {
  it.each(vectors.cases)(
    'pins the canonical bytes of $name',
    ({ derived, input }) => {
      expect(canonicalize(input)).toBe(derived.canonical);
    },
  );

  it.each(vectors.cases)(
    'derives the record id of $name',
    ({ derived, input }) => {
      expect(MLSRecordId.derive(input).valueOf()).toBe(derived.recordId);
      expect(
        MLSRecordDocumentId.of(vectors.communityId, derived.recordId),
      ).toBe(derived.documentId);
    },
  );

  it.each(vectors.cases)(
    'accepts the replicated document of $name',
    ({ derived, input }) => {
      const policy = new MLSRecordMutationPolicy(mock<CommunityRepository>());

      expect(
        policy.expectationOf({
          ...input,
          authorIdentityId: AUTHOR,
          communityId: vectors.communityId,
          createdAt: 1_700_000_000_000,
          id: derived.documentId,
          scopeType: 'community_mls',
        }).recordId,
      ).toBe(derived.documentId);
    },
  );

  it.each(vectors.distinct)(
    'does not derive the id of $name',
    ({ canonical, recordId }) => {
      const input = JSON.parse(canonical) as MLSRecordIdContent;

      expect(canonicalize(input)).not.toBe(canonical);
      expect(MLSRecordId.derive(input).valueOf()).not.toBe(recordId);
    },
  );
});
