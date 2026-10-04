import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationReplay } from './documents/OrbitDBDeviceAuthorizationReplay';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationDocumentShape from './OrbitDBDeviceAuthorizationDocumentShape';
import OrbitDBDeviceAuthorizationReplayer from './OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';

export default class OrbitDBDeviceAuthorizationDocumentFactory {
  public constructor(
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
    private readonly replayer: OrbitDBDeviceAuthorizationReplayer,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
    private readonly shape: OrbitDBDeviceAuthorizationDocumentShape,
  ) {}

  private minimalOverflowSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const hasBoundedHistory = this.shape.hasBoundedHistoryShape(
      this.replayer.replaySources(genesis, sources).replay.history,
    );

    for (let length = 1; length <= sources.length; length += 1) {
      const candidate = sources.slice(0, length);

      if (
        hasBoundedHistory
          ? !this.shape.hasBoundedSourcesShape(candidate)
          : !this.shape.hasBoundedProjection(
              this.replayer.replaySources(genesis, candidate).replay,
              candidate,
            )
      ) {
        return candidate;
      }
    }

    assert(false, new InvalidDeviceAuthorizationTransitionError());
  }

  public documentId(identityId: IdentityId): string {
    return `device-authorization:${identityId.valueOf()}`;
  }

  public toDocument(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'],
    sources?: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument {
    assert(
      this.shape.hasBoundedHistoryShape(history),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const baseAuthorization = checkpoint
      ? this.replayer.authorizationFromCheckpoint(genesis, checkpoint)
      : genesis;
    const replay = this.replayer.rebuild(baseAuthorization, history);
    const canonicalSources = this.replayer.sourcesAtPreferredCheckpoint(
      genesis,
      this.sources.canonicalSources(
        sources ?? [
          {
            ...(checkpoint ? { checkpoint } : {}),
            history: replay.history,
          },
        ],
      ),
    );
    const projection = this.replayer.replaySources(genesis, canonicalSources);

    return this.documentFromReplay(
      genesis,
      projection.replay,
      canonicalSources,
      projection.checkpoint,
    );
  }

  public documentFromReplay(
    genesis: DeviceAuthorization,
    replay: OrbitDBDeviceAuthorizationReplay,
    sources: OrbitDBDeviceAuthorizationSource[],
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'],
  ): OrbitDBDeviceAuthorizationDocument {
    assert(
      this.shape.hasBoundedHistoryShape(replay.history) &&
        this.shape.hasBoundedSourcesShape(sources),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return {
      authorization: replay.authorization.toPrimitives(),
      ...(checkpoint ? { checkpoint } : {}),
      genesis: genesis.toPrimitives(),
      history: replay.history,
      id: this.documentId(replay.authorization.getIdentityId()),
      identityId: replay.authorization.getIdentityId().valueOf(),
      kind: 'device_authorization',
      sources,
    };
  }

  public frontierFromSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument {
    const ordered = sources
      .map((source) => ({
        replay: this.replayer.sourceReplay(genesis, source),
        source,
      }))
      .sort(
        (left, right) =>
          right.replay.authorization.getRevision().valueOf() -
            left.replay.authorization.getRevision().valueOf() ||
          this.canonicalizer
            .serialize(left.source)
            .localeCompare(this.canonicalizer.serialize(right.source)),
      );
    const [frontier] = ordered;

    assert(
      frontier !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.toDocument(
      genesis,
      frontier.source.history,
      frontier.source.checkpoint,
      [frontier.source],
    );
  }

  public overflowDocument(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
    frontier: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument {
    const witness = this.minimalOverflowSources(genesis, sources);
    const replay = this.replayer.replaySources(genesis, witness).replay;
    const authorization = replay.authorization.requireRecoveryAt(
      this.overflowRevision(replay, frontier),
    );

    return {
      authorization: authorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [],
      id: this.documentId(genesis.getIdentityId()),
      identityId: genesis.getIdentityId().valueOf(),
      kind: 'device_authorization',
      overflow: {
        frontier,
        sources: witness,
      },
      sources: [],
    };
  }

  public overflowRevision(
    replay: OrbitDBDeviceAuthorizationReplay,
    frontier: OrbitDBDeviceAuthorizationDocument,
  ): DeviceAuthorizationRevision {
    const replayRevision = replay.authorization.getRevision();
    const frontierRevision = new DeviceAuthorizationRevision(
      frontier.authorization.revision,
    );
    const latestRevision = replayRevision.isGreaterThan(frontierRevision)
      ? replayRevision
      : frontierRevision;

    return latestRevision.next();
  }
}
