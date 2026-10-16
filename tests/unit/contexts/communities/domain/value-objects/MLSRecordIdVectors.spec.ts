import { MLSRecordPublishMessage } from '@app/contexts/communities/application/publish-mls-record/messages/MLSRecordPublishMessage';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { MLSRecordId } from '@app/contexts/communities/domain/value-objects/MLSRecordId';
import { MLSRecordDocumentId } from '@app/contexts/communities/infrastructure/orbitdb/MLSRecordDocumentId';
import MLSRecordMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/MLSRecordMutationPolicy';
import {
  InvalidCommitmentError,
  MlsRecordContent,
} from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { cryptoVectors } from '../../../../../support/cryptoVectors';
import { signedMutation } from '../../../public-mutations/support/signedMutation';

interface Vectors {
  mlsRecord: {
    distinct: { id: string; name: string; preimage: string }[];
    invalid: { args: [MlsRecordContent]; name: string }[];
    valid: { args: [MlsRecordContent]; id: string; name: string }[];
  };
}

const { mlsRecord } = cryptoVectors<Vectors>('commitment-ids');
const AUTHOR = 'MCowBQYDK2VwAyEAA/wgW5GzeJmnvGBt2yZCsEOcMr6Q8fMmtwk4an4oUe4=';
const COMMUNITY_ID = 'xYNd_IvZ349vIYp8ZJhU1f1Imo9uPtllZlvbuZC3Tm4';
const storable = mlsRecord.valid.filter(
  ({ args: [content] }) => content.recipientIdentityId !== '',
);

describe('MLS record id vectors', () => {
  it.each(mlsRecord.valid)('derives the record id of $name', ({ args, id }) => {
    expect(MLSRecordId.derive(args[0]).valueOf()).toBe(id);
  });

  it.each(mlsRecord.invalid)('rejects $name', ({ args }) => {
    expect(() => MLSRecordId.derive(args[0])).toThrow(InvalidCommitmentError);
  });

  it.each(mlsRecord.distinct)(
    'does not derive the id of $name',
    ({ id, preimage }) => {
      expect(
        MLSRecordId.derive(JSON.parse(preimage) as MlsRecordContent).valueOf(),
      ).not.toBe(id);
    },
  );

  it.each(storable)(
    'accepts the replicated document of $name',
    ({ args: [content], id }) => {
      const policy = new MLSRecordMutationPolicy(mock<CommunityRepository>());
      const documentId = MLSRecordDocumentId.of(COMMUNITY_ID, id);

      expect(
        policy.expectationOf({
          ...content,
          authorIdentityId: AUTHOR,
          communityId: COMMUNITY_ID,
          createdAt: 1_700_000_000_000,
          id: documentId,
          scopeType: 'community_mls',
        }).recordId,
      ).toBe(documentId);
    },
  );

  it.each(mlsRecord.valid)(
    'publishes an HTTP body of $name under the client id',
    async ({ args: [content], id }) => {
      const mutation = await signedMutation({
        identityId: AUTHOR,
        kind: 'put',
        recordId: MLSRecordDocumentId.of(COMMUNITY_ID, id),
        sequence: 0,
        store: 'mlsRecords',
      });
      const message = new MLSRecordPublishMessage({
        ...content,
        authorIdentityId: AUTHOR,
        communityId: COMMUNITY_ID,
        createdAt: 1_700_000_000_000,
        mutation: mutation.toPrimitives(),
      });

      expect(message.record.id.valueOf()).toBe(id);
    },
  );
});
