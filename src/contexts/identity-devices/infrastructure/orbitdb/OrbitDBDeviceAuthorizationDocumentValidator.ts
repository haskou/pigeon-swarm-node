import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationReplay } from './documents/OrbitDBDeviceAuthorizationReplay';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationDocumentFactory from './OrbitDBDeviceAuthorizationDocumentFactory';
import OrbitDBDeviceAuthorizationDocumentShape from './OrbitDBDeviceAuthorizationDocumentShape';
import OrbitDBDeviceAuthorizationGenesisMatcher from './OrbitDBDeviceAuthorizationGenesisMatcher';
import OrbitDBDeviceAuthorizationReplayer from './OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';

export default class OrbitDBDeviceAuthorizationDocumentValidator {
  private readonly documentValidationCache = new Map<string, boolean>();

  public constructor(
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
    private readonly factory: OrbitDBDeviceAuthorizationDocumentFactory,
    private readonly genesisMatcher: OrbitDBDeviceAuthorizationGenesisMatcher,
    private readonly replayer: OrbitDBDeviceAuthorizationReplayer,
    private readonly shape: OrbitDBDeviceAuthorizationDocumentShape,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
  ) {}

  private validateDocument(value: Record<string, unknown>): boolean {
    try {
      if (!this.shape.hasDocumentShape(value)) {
        return false;
      }

      const document = value as unknown as OrbitDBDeviceAuthorizationDocument;

      if (document.overflow) {
        return this.isOverflowDocument(document);
      }

      if (!this.shape.hasBoundedHistoryShape(document.history)) {
        return false;
      }

      const genesis = DeviceAuthorization.fromPrimitives(document.genesis);

      return (
        this.hasValidGenesis(document, genesis) &&
        isDeepStrictEqual(document.genesis, genesis.toPrimitives()) &&
        this.hasValidSources(document, genesis)
      );
    } catch {
      return false;
    }
  }

  private hasValidGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    const credentials = genesis.getCredentials();

    return (
      document.id === this.factory.documentId(genesis.getIdentityId()) &&
      document.identityId === genesis.getIdentityId().valueOf() &&
      genesis.getRevision().isEqual(DeviceAuthorizationRevision.initial()) &&
      credentials.length === 1
    );
  }

  private matchesReplay(
    document: OrbitDBDeviceAuthorizationDocument,
    replay: OrbitDBDeviceAuthorizationReplay,
  ): boolean {
    return (
      isDeepStrictEqual(
        document.authorization,
        replay.authorization.toPrimitives(),
      ) && isDeepStrictEqual(document.history, replay.history)
    );
  }

  private isValidSource(
    genesis: DeviceAuthorization,
    source: OrbitDBDeviceAuthorizationSource,
  ): boolean {
    if (!this.shape.hasBoundedHistoryShape(source.history)) {
      return false;
    }

    return isDeepStrictEqual(
      this.replayer.sourceReplay(genesis, source).history,
      source.history,
    );
  }

  private hasValidSources(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    const sources = this.sources.documentSources(document);

    if (
      !this.shape.hasBoundedSourcesShape(sources) ||
      !isDeepStrictEqual(sources, this.sources.canonicalSources(sources)) ||
      !sources.every(
        (source) =>
          this.shape.hasSourceShape(source) &&
          this.isValidSource(genesis, source),
      )
    ) {
      return false;
    }

    const normalizedSources = this.replayer.sourcesAtPreferredCheckpoint(
      genesis,
      sources,
    );
    const { checkpoint, replay } = this.replayer.replaySources(
      genesis,
      normalizedSources,
    );

    return (
      isDeepStrictEqual(sources, normalizedSources) &&
      isDeepStrictEqual(document.checkpoint, checkpoint) &&
      this.matchesReplay(document, replay)
    );
  }

  private isOverflowDocument(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const overflow = document.overflow;

    if (!overflow || !this.hasValidOverflowEvidence(document, overflow)) {
      return false;
    }

    const genesis = DeviceAuthorization.fromPrimitives(document.genesis);
    const replay = this.replayer.replaySources(
      genesis,
      overflow.sources,
    ).replay;
    const authorization = replay.authorization.requireRecoveryAt(
      this.factory.overflowRevision(replay, overflow.frontier),
    );

    return (
      this.hasValidGenesis(document, genesis) &&
      isDeepStrictEqual(document.genesis, genesis.toPrimitives()) &&
      isDeepStrictEqual(document.authorization, authorization.toPrimitives())
    );
  }

  private hasValidOverflowEvidence(
    document: OrbitDBDeviceAuthorizationDocument,
    overflow: NonNullable<OrbitDBDeviceAuthorizationDocument['overflow']>,
  ): boolean {
    if (!this.hasEmptyOverflowProjection(document)) {
      return false;
    }

    const genesis = DeviceAuthorization.fromPrimitives(document.genesis);

    return (
      this.hasDominantOverflowFrontier(document, genesis, overflow) &&
      this.isMinimalOverflowSources(genesis, overflow.sources)
    );
  }

  private hasDominantOverflowFrontier(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
    overflow: NonNullable<OrbitDBDeviceAuthorizationDocument['overflow']>,
  ): boolean {
    if (
      overflow.frontier.overflow !== undefined ||
      !this.isDocument(overflow.frontier) ||
      this.sources.documentSources(overflow.frontier).length !== 1 ||
      !this.genesisMatcher.sameGenesis(document, overflow.frontier)
    ) {
      return false;
    }

    const sources = this.replayer.sourcesAtPreferredCheckpoint(
      genesis,
      this.sources.canonicalSources([
        ...overflow.sources,
        ...this.sources.documentSources(overflow.frontier),
      ]),
    );

    return isDeepStrictEqual(
      overflow.frontier,
      this.factory.frontierFromSources(genesis, sources),
    );
  }

  private hasEmptyOverflowProjection(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    return (
      document.checkpoint === undefined &&
      document.history.length === 0 &&
      (document.sources?.length ?? 0) === 0
    );
  }

  private isMinimalOverflowSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const replay = this.replayer.replaySources(genesis, sources).replay;
    const hasBoundedHistory = this.shape.hasBoundedHistoryShape(replay.history);
    const hasBoundedSources = this.shape.hasBoundedSourcesShape(sources);

    if (
      sources.length === 0 ||
      (hasBoundedHistory && hasBoundedSources) ||
      !this.shape.hasBoundedOverflowSourcesShape(sources) ||
      !isDeepStrictEqual(sources, this.sources.canonicalSources(sources)) ||
      !isDeepStrictEqual(
        sources,
        this.replayer.sourcesAtPreferredCheckpoint(genesis, sources),
      ) ||
      !sources.every(
        (source) =>
          this.shape.hasSourceShape(source) &&
          this.isValidSource(genesis, source),
      )
    ) {
      return false;
    }

    return this.hasBoundedOverflowPrefix(
      genesis,
      sources.slice(0, -1),
      hasBoundedHistory,
    );
  }

  private hasBoundedOverflowPrefix(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
    completeHistoryIsBounded: boolean,
  ): boolean {
    if (completeHistoryIsBounded) {
      return this.shape.hasBoundedSourcesShape(sources);
    }

    return this.shape.hasBoundedProjection(
      this.replayer.replaySources(genesis, sources).replay,
      sources,
    );
  }

  public isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBDeviceAuthorizationDocument {
    if (!this.shape.hasDocumentAdmissionShape(value)) {
      return false;
    }

    let fingerprint: string;

    try {
      const serialized = JSON.stringify(value);

      if (
        Buffer.byteLength(serialized, 'utf8') >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_DOCUMENT_ADMISSION_BYTES
      ) {
        return false;
      }

      fingerprint = createHash('sha256')
        .update(this.canonicalizer.serialize(value))
        .digest('base64url');
    } catch {
      return false;
    }
    const cached = this.documentValidationCache.get(fingerprint);

    if (cached !== undefined) {
      return cached;
    }

    const valid = this.validateDocument(value);

    this.documentValidationCache.set(fingerprint, valid);

    if (this.documentValidationCache.size > 128) {
      const [oldest] = this.documentValidationCache.keys();

      if (oldest) {
        this.documentValidationCache.delete(oldest);
      }
    }

    return valid;
  }
}
