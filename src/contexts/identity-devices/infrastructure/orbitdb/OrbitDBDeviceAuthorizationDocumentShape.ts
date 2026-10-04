import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationReplay } from './documents/OrbitDBDeviceAuthorizationReplay';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';

export default class OrbitDBDeviceAuthorizationDocumentShape {
  public static readonly MAX_CONCURRENT_TRANSITIONS = 128;

  public static readonly MAX_TRANSITION_RECORDS = 256;

  public static readonly MAX_TRANSITION_HISTORY_BYTES = 1_048_576;

  public static readonly MAX_TRANSITION_RECORD_BYTES = 16_384;

  public static readonly MAX_OVERFLOW_SOURCE_RECORDS = 512;

  public static readonly MAX_OVERFLOW_SOURCE_BYTES = 2_200_000;

  public static readonly MAX_DOCUMENT_ADMISSION_BYTES = 6_000_000;

  public static readonly MAX_DOCUMENT_ADMISSION_NODES = 100_000;

  public static readonly MAX_DOCUMENT_ADMISSION_DEPTH = 64;

  private hasExactKeys(
    value: Record<string, unknown>,
    expected: string[],
  ): boolean {
    const keys = Object.keys(value).sort();

    return isDeepStrictEqual(keys, [...expected].sort());
  }

  private isBoundedTransitionRecord(
    value: unknown,
  ): value is { transition: Record<string, unknown> } {
    if (
      !this.isRecord(value) ||
      !this.hasExactKeys(value, ['transition']) ||
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_TRANSITION_RECORD_BYTES
    ) {
      return false;
    }

    return this.isRecord(value.transition);
  }

  private previousRevisionOf(record: {
    transition: Record<string, unknown>;
  }): number | undefined {
    const { previousRevision } = record.transition;

    return typeof previousRevision === 'number' &&
      Number.isSafeInteger(previousRevision) &&
      previousRevision >= 0
      ? previousRevision
      : undefined;
  }

  private hasCheckpointShape(checkpoint: unknown): boolean {
    return (
      checkpoint === undefined ||
      (this.isRecord(checkpoint) &&
        this.hasExactKeys(checkpoint, [
          'authorization',
          'lineage',
          'transition',
        ]) &&
        this.isRecord(checkpoint.authorization) &&
        Array.isArray(checkpoint.lineage) &&
        checkpoint.lineage.length <= 1024 &&
        checkpoint.lineage.every((record) =>
          this.isBoundedTransitionRecord(record),
        ) &&
        this.isBoundedTransitionRecord(checkpoint.transition))
    );
  }

  private hasOverflowShape(overflow: unknown, checkpoint: unknown): boolean {
    return (
      overflow === undefined ||
      (checkpoint === undefined &&
        this.isRecord(overflow) &&
        this.hasOverflowFields(overflow))
    );
  }

  private hasOverflowFields(overflow: Record<string, unknown>): boolean {
    return (
      this.hasExactKeys(overflow, ['frontier', 'sources']) &&
      Array.isArray(overflow.sources) &&
      this.isRecord(overflow.frontier)
    );
  }

  private hasDocumentCoreShape(value: Record<string, unknown>): boolean {
    return (
      value.kind === 'device_authorization' &&
      typeof value.id === 'string' &&
      typeof value.identityId === 'string' &&
      Array.isArray(value.history) &&
      (value.sources === undefined || Array.isArray(value.sources)) &&
      this.isRecord(value.genesis) &&
      this.isRecord(value.authorization)
    );
  }

  private exceedsAdmissionTraversal(nodes: number, depth: number): boolean {
    return (
      nodes >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_DOCUMENT_ADMISSION_NODES ||
      depth >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_DOCUMENT_ADMISSION_DEPTH
    );
  }

  private admitDocumentNode(
    value: unknown,
  ): { bytes: number; children: unknown[] } | undefined {
    if (typeof value === 'string') {
      return { bytes: Buffer.byteLength(value, 'utf8'), children: [] };
    }

    if (Array.isArray(value)) {
      return value.length <= 1024 ? { bytes: 0, children: value } : undefined;
    }

    if (!this.isRecord(value)) {
      return { bytes: 8, children: [] };
    }

    const entries = Object.entries(value);

    return entries.length <= 32
      ? {
          bytes: entries.reduce(
            (total, [key]) => total + Buffer.byteLength(key, 'utf8'),
            0,
          ),
          children: entries.map(([, item]) => item),
        }
      : undefined;
  }

  public isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  public hasBoundedHistoryShape(history: unknown[]): boolean {
    if (
      history.length >
      OrbitDBDeviceAuthorizationDocumentShape.MAX_TRANSITION_RECORDS
    ) {
      return false;
    }

    const recordsByRevision = new Map<number, number>();
    let historyBytes = 0;

    for (const value of history) {
      if (!this.isBoundedTransitionRecord(value)) {
        return false;
      }

      historyBytes += Buffer.byteLength(JSON.stringify(value), 'utf8');

      if (
        historyBytes >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_TRANSITION_HISTORY_BYTES
      ) {
        return false;
      }

      const previousRevision = this.previousRevisionOf(value);

      if (previousRevision === undefined) {
        return false;
      }

      const count = (recordsByRevision.get(previousRevision) ?? 0) + 1;

      recordsByRevision.set(previousRevision, count);

      if (
        count >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_CONCURRENT_TRANSITIONS
      ) {
        return false;
      }
    }

    return true;
  }

  public hasBoundedSourcesShape(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const recordCount = sources.reduce(
      (count, source) => count + source.history.length,
      0,
    );

    return (
      sources.length > 0 &&
      recordCount <=
        OrbitDBDeviceAuthorizationDocumentShape.MAX_TRANSITION_RECORDS &&
      Buffer.byteLength(JSON.stringify(sources), 'utf8') <=
        OrbitDBDeviceAuthorizationDocumentShape.MAX_TRANSITION_HISTORY_BYTES
    );
  }

  public hasBoundedOverflowSourcesShape(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const recordCount = sources.reduce(
      (count, source) => count + source.history.length,
      0,
    );

    return (
      recordCount <=
        OrbitDBDeviceAuthorizationDocumentShape.MAX_OVERFLOW_SOURCE_RECORDS &&
      Buffer.byteLength(JSON.stringify(sources), 'utf8') <=
        OrbitDBDeviceAuthorizationDocumentShape.MAX_OVERFLOW_SOURCE_BYTES
    );
  }

  public hasDocumentShape(value: Record<string, unknown>): boolean {
    const checkpoint = value.checkpoint;
    const overflow = value.overflow;

    return (
      this.hasExactKeys(value, [
        'authorization',
        'genesis',
        'history',
        'id',
        'identityId',
        'kind',
        ...(value.sources === undefined ? [] : ['sources']),
        ...(checkpoint === undefined ? [] : ['checkpoint']),
        ...(overflow === undefined ? [] : ['overflow']),
      ]) &&
      this.hasDocumentCoreShape(value) &&
      this.hasCheckpointShape(checkpoint) &&
      this.hasOverflowShape(overflow, checkpoint)
    );
  }

  public hasSourceShape(
    source: unknown,
  ): source is OrbitDBDeviceAuthorizationSource {
    if (!this.isRecord(source)) {
      return false;
    }

    const checkpoint = source.checkpoint;

    return (
      this.hasExactKeys(source, [
        'history',
        ...(checkpoint === undefined ? [] : ['checkpoint']),
      ]) &&
      Array.isArray(source.history) &&
      this.hasCheckpointShape(checkpoint)
    );
  }

  public hasBoundedProjection(
    replay: OrbitDBDeviceAuthorizationReplay,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    return (
      this.hasBoundedSourcesShape(sources) &&
      this.hasBoundedHistoryShape(replay.history)
    );
  }

  public hasDocumentAdmissionShape(value: unknown): boolean {
    const stack: Array<{ depth: number; value: unknown }> = [
      { depth: 0, value },
    ];
    let bytes = 0;
    let nodes = 0;

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      nodes += 1;

      if (this.exceedsAdmissionTraversal(nodes, current.depth)) {
        return false;
      }

      const admitted = this.admitDocumentNode(current.value);

      if (!admitted) {
        return false;
      }

      bytes += admitted.bytes;
      stack.push(
        ...admitted.children.map((item) => ({
          depth: current.depth + 1,
          value: item,
        })),
      );

      if (
        bytes >
        OrbitDBDeviceAuthorizationDocumentShape.MAX_DOCUMENT_ADMISSION_BYTES
      ) {
        return false;
      }
    }

    return true;
  }
}
