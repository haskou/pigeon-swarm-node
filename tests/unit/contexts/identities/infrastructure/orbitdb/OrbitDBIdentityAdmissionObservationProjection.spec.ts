import IdentityAdmissionObserver from '@app/contexts/identities/application/observe-admission/IdentityAdmissionObserver';
import { IdentityAdmissionObservationMessage } from '@app/contexts/identities/application/observe-admission/messages/IdentityAdmissionObservationMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityMetadataRecord } from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataRecord';
import OrbitDBIdentityAdmissionObservationProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityAdmissionObservationProjection';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;

describe(OrbitDBIdentityAdmissionObservationProjection.name, () => {
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let metadataIndex: MockProxy<OrbitDBIdentityMetadataIndex>;
  let observer: MockProxy<IdentityAdmissionObserver>;
  let projection: OrbitDBIdentityAdmissionObservationProjection;
  let listener: (document: Record<string, unknown>) => void | Promise<void>;

  function recordOf(identity: Identity, cid: string): IdentityMetadataRecord {
    const primitives = identity.toPrimitives();

    return {
      cid,
      handle: primitives.profile.handle,
      identity,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      version: primitives.version,
    };
  }

  function documentOf(record: IdentityMetadataRecord): Record<string, unknown> {
    return {
      cid: record.cid,
      identity: record.identity.toPrimitives(),
      identityId: record.identityId,
      version: record.version,
    };
  }

  beforeEach(async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new IdentityMother().timestamp.valueOf());
    registry = mock<OrbitDBReplicatedStateRegistry>();
    metadataIndex = mock<OrbitDBIdentityMetadataIndex>();
    observer = mock<IdentityAdmissionObserver>();
    registry.onDocumentUpdated.mockImplementation((_, candidate) => {
      listener = candidate;

      return Promise.resolve();
    });
    metadataIndex.findByIdentityId.mockResolvedValue([]);
    projection = new OrbitDBIdentityAdmissionObservationProjection(
      registry,
      metadataIndex,
      observer,
    );
    await projection.start();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to identity documents only once', async () => {
    await Promise.all([projection.start(), projection.start()]);

    expect(registry.onDocumentUpdated).toHaveBeenCalledTimes(1);
    expect(registry.onDocumentUpdated).toHaveBeenCalledWith(
      'identities',
      expect.any(Function),
    );
  });

  it('observes a fresh, canonical genesis', async () => {
    const record = recordOf(new IdentityMother().build(), 'bafkgenesis');
    metadataIndex.verifiedRecordOf.mockResolvedValue(record);

    await listener(documentOf(record));

    expect(observer.observe).toHaveBeenCalledWith(
      new IdentityAdmissionObservationMessage(record.identity, record.cid),
    );
    expect(metadataIndex.findByIdentityId).not.toHaveBeenCalled();
  });

  it('observes an update together with its known previous version', async () => {
    const mother = new IdentityMother();
    const previous = recordOf(mother.build(), 'bafypreviousidentity');
    const update = recordOf(await mother.buildNext(), 'bafkupdate');
    metadataIndex.verifiedRecordOf.mockResolvedValue(update);
    metadataIndex.findByIdentityId.mockResolvedValue([update, previous]);

    await listener(documentOf(update));

    expect(metadataIndex.findByIdentityId).toHaveBeenCalledWith(
      new IdentityId(update.identityId),
    );
    expect(observer.observe).toHaveBeenCalledWith(
      new IdentityAdmissionObservationMessage(
        update.identity,
        update.cid,
        previous.identity,
      ),
    );
  });

  it('skips stale documents before verifying them', async () => {
    const record = recordOf(new IdentityMother().build(), 'bafkstale');
    jest.spyOn(Date, 'now').mockReturnValue(
      new IdentityMother().timestamp.valueOf() + HORIZON + 1,
    );

    await listener(documentOf(record));

    expect(metadataIndex.verifiedRecordOf).not.toHaveBeenCalled();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('skips documents that are not canonical identity records', async () => {
    const record = recordOf(new IdentityMother().build(), 'bafkforged');
    metadataIndex.verifiedRecordOf.mockResolvedValue(undefined);

    await listener(documentOf(record));
    await listener({ cid: 'bafkmalformed', identity: 'not-an-identity' });

    expect(observer.observe).not.toHaveBeenCalled();
  });
});
