import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationOverflowBound } from '@app/contexts/identity-devices/domain/DeviceAuthorizationOverflowBound';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
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
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
    private readonly replayer: OrbitDBDeviceAuthorizationReplayer,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
    private readonly shape: OrbitDBDeviceAuthorizationDocumentShape,
  ) {}

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

  /**
   * The overflow bound measured over sources replayed from the genesis: the
   * replayed history, the sources, and the projection must each fit one
   * document.
   */
  public overflowBound(
    genesis: DeviceAuthorization,
  ): DeviceAuthorizationOverflowBound<OrbitDBDeviceAuthorizationSource> {
    return {
      fitsProjection: (sources) =>
        this.shape.hasBoundedProjection(
          this.replayer.replaySources(genesis, sources).replay,
          sources,
        ),
      fitsReplayedHistory: (sources) =>
        this.shape.hasBoundedHistoryShape(
          this.replayer.replaySources(genesis, sources).replay.history,
        ),
      fitsSources: (sources) => this.shape.hasBoundedSourcesShape(sources),
    };
  }

  public frontierFromSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument {
    const frontier = this.policy.preferFrontier(
      sources.map((source) => ({
        encoding: this.canonicalizer.serialize(source),
        payload: source,
        revision: this.replayer
          .sourceReplay(genesis, source)
          .authorization.getRevision(),
      })),
    );

    return this.toDocument(genesis, frontier.history, frontier.checkpoint, [
      frontier,
    ]);
  }

  public overflowDocument(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
    frontier: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument {
    const witness = this.policy.minimalOverflowWitness(
      sources,
      this.overflowBound(genesis),
    );
    const authorization = this.policy.suspendAtOverflow(
      this.replayer.replaySources(genesis, witness).replay.authorization,
      new DeviceAuthorizationRevision(frontier.authorization.revision),
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
}
