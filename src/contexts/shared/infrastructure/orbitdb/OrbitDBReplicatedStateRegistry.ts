import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import Kernel from '@haskou/ddd-kernel';
import { StateDigest } from '@haskou/pigeon-swarm-crypto';

import { CompositeOrbitDBMutationGate } from './CompositeOrbitDBMutationGate';
import LocalOrbitDBReplicatedHeadCache from './LocalOrbitDBReplicatedHeadCache';
import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBDocumentHistory } from './OrbitDBDocumentHistory';
import { OrbitDBEntry } from './OrbitDBEntry';
import { OrbitDBHeadHistoryReader } from './OrbitDBHeadHistoryReader';
import { OrbitDBHeadReadmission } from './OrbitDBHeadReadmission';
import { OrbitDBHeadRecordMerger } from './OrbitDBHeadRecordMerger';
import { OrbitDBHeadRecordScope } from './OrbitDBHeadRecordScope';
import { OrbitDBHeadRepairPublisher } from './OrbitDBHeadRepairPublisher';
import { OrbitDBHistoryReplayObserver } from './OrbitDBHistoryReplayObserver';
import {
  OrbitDBMutationGate,
  OrbitDBMutationVerdict,
} from './OrbitDBMutationGate';
import { OrbitDBPendingHeadReconciliation } from './OrbitDBPendingHeadReconciliation';
import { OrbitDBPrivateNetworkStores } from './OrbitDBPrivateNetworkStores';
import { OrbitDBRecordReadmission } from './OrbitDBRecordReadmission';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedHeadCache from './OrbitDBReplicatedHeadCache';
import OrbitDBReplicatedHeadKeyDeriver from './OrbitDBReplicatedHeadKeyDeriver';
import { isOrbitDBTransientBlockError } from './OrbitDBTransientBlockError';
import ReplicatedStateNotReadyError from './ReplicatedStateNotReadyError';

type PersistedHeadCacheHydration = {
  heads: number;
  reconciledHeadSignature?: string;
  warm: boolean;
};

type UnverifiedCopyKey = string | symbol;

type UnverifiedHeadCopy = {
  /** Digest of the admitted part last delivered for this copy. */
  delivered?: UnverifiedCopyKey;
  heldAt: number;
  onAdmitted: OrbitDBHeadReadmission['onAdmitted'];
  /** Restored from this node's own persisted head cache. */
  own: boolean;
  value: Record<string, unknown>;
};

/** A head's admitted part, and how many of its gated records were kept. */
type GatedAdmission = {
  admitted: Record<string, unknown>;
  kept: number;
  verdict: OrbitDBMutationVerdict;
};

type UnverifiedHeadCopies = Map<UnverifiedCopyKey, UnverifiedHeadCopy>;

/** Held heads of one network, by head key. */
type UnverifiedHeads = Map<string, UnverifiedHeadCopies>;

/** When copies of a head key last expired unverified, and how often. */
type ExpiredHeadKey = { at: number; expiries: number };

/** Oldest held copies beyond this are dropped, per head key. */
const MAX_UNVERIFIED_COPIES_PER_HEAD = 8;

/** Held head keys per network that are offered to the gate first. */
const MAX_UNVERIFIED_HEADS_PER_NETWORK = 256;

/**
 * A held copy no longer gates reads once it has waited this long. A peer
 * plants copies that never prove out, so a hold must end by itself. The head
 * KEY is then remembered as expired: it is not held again for the same time,
 * whatever the digest of the copy offered, and never again after
 * `MAX_HOLDS_PER_HEAD_KEY` expiries while remembered. So one fresh copy per
 * period cannot renew a hold for good.
 */
const MAX_HELD_COPY_AGE_MS = 15 * 60_000;

const MAX_HOLDS_PER_HEAD_KEY = 3;

const MAX_EXPIRED_KEYS_REMEMBERED = 1024;

/** Dropped head keys remembered per network; past it a key is not remembered. */
const MAX_DROPPED_HEAD_KEYS_PER_NETWORK = 1024;

/**
 * Verified head keys remembered per network. A peer drives the set, so the
 * oldest keys are evicted past it, except the keys restored from this node's
 * own cache.
 */
const MAX_VERIFIED_HEAD_KEYS_PER_NETWORK = 8192;

/** Pending records are logged, as counts, at most this often. */
const PENDING_RECORD_LOG_INTERVAL_MS = 60_000;

/**
 * Held head keys per network that queue behind the active ones, in arrival
 * order. A head beyond both bounds is dropped and overflows its network.
 */
const MAX_QUEUED_UNVERIFIED_HEADS_PER_NETWORK = 256;

/** Held heads are offered again this often once their offers retire. */
const HEAD_RETRY_INTERVAL_MS = 60_000;

const updatedAtOf = (value: Record<string, unknown>): number | undefined =>
  typeof value.updatedAt === 'number' ? value.updatedAt : undefined;

/**
 * A head that is not accepted is delivered demoted, so the records it does
 * admit still reach readers without outranking a valid head.
 */
const deliveredHead = (
  admitted: Record<string, unknown>,
  verdict: OrbitDBMutationVerdict,
): Record<string, unknown> =>
  verdict === 'accepted' ? admitted : { ...admitted, updatedAt: 0 };

/**
 * The admitted part of a head with withheld records. Nothing is delivered
 * until a gated record is kept, so a head with none admitted stays absent.
 */
const withheldPart = ({
  admitted,
  kept,
}: GatedAdmission): Record<string, unknown> | undefined =>
  kept > 0 ? deliveredHead(admitted, 'pending') : undefined;

/** Pending outranks refused, and refused outranks accepted. */
const worstVerdict = (
  verdicts: OrbitDBMutationVerdict[],
): OrbitDBMutationVerdict => {
  if (verdicts.includes('pending')) return 'pending';

  return verdicts.includes('refused') ? 'refused' : 'accepted';
};

export default class OrbitDBReplicatedStateRegistry {
  private static readonly DOCUMENT_STORE_NAMES: OrbitDBReplicatedDocumentStoreName[] =
    [
      'calls',
      'communityOperations',
      'conversationOperations',
      'identities',
      'contentReplication',
      'keychains',
      'messages',
      'mlsRecords',
      'moderationLogs',
      'notificationSettings',
      'notifications',
      'pins',
      'polls',
      'reactions',
      'requests',
      'stickerPacks',
      'stickerUserLibraries',
    ];

  // TODO: Move indexed head merge policy to OrbitDBHeadIndex before adding
  // per-index record identity or freshness rules here.
  private static readonly INDEX_HEAD_COLLECTION_NAMES = new Set([
    'communityOperations',
    'conversationOperations',
    'messages',
    'mlsRecords',
    'moderationLogs',
    'notificationSettings',
    'pins',
    'polls',
    'reactions',
    'requests',
    'stickerPacks',
    'stickerUserLibraries',
    'summaries',
  ]);

  private static readonly HYDRATION_BATCH_SIZE = 16;

  /**
   * How long after a store first deferred a subscriber bootstrap its readers
   * answer "not ready" instead of "missing". Past it, a store that still cannot
   * replay answers as before, so a block nobody serves cannot hold reads off.
   */
  public static readonly DEFERRED_BOOTSTRAP_NOT_READY_MS = 60_000;

  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBPrivateNetworkStores
  >();

  private readonly projectedHeads = new Map<string, Record<string, unknown>>();

  private readonly exactProjectedHeadKeys = new Set<string>();

  private readonly replicatedHeadsByNetworkId = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();

  /**
   * The replacement of a network's head cache while it is rebuilt from the log.
   * Readers keep seeing the previous cache until the rebuilt one takes over, so
   * a reconciliation never makes a replicated head look absent.
   */
  private readonly rebuildingHeadsByNetworkId = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();

  private readonly persistedHeadKeysByNetworkId = new Map<
    string,
    Set<string>
  >();

  private readonly documentUpdateListeners = new Map<
    OrbitDBReplicatedDocumentStoreName,
    Set<
      (
        document: Record<string, unknown>,
        scope?: object,
      ) => void | Promise<void>
    >
  >();

  private readonly historyObservers = new Map<
    OrbitDBReplicatedDocumentStoreName,
    Set<OrbitDBHistoryReplayObserver>
  >();

  private readonly historyStoreNames =
    new Set<OrbitDBReplicatedDocumentStoreName>();

  private readonly documentHistories = new WeakMap<
    OrbitDBDatabase,
    OrbitDBDocumentHistory
  >();

  private readonly documentUpdateListenerStores = new Map<
    OrbitDBReplicatedDocumentStoreName,
    WeakSet<OrbitDBDatabase>
  >();

  private readonly headCacheListenerStores = new WeakSet<OrbitDBDatabase>();

  private readonly pendingSubscriberBootstraps = new WeakMap<
    OrbitDBDatabase,
    Array<() => Promise<void>>
  >();

  /** When each store first deferred a bootstrap, and how many still wait. */
  private readonly deferredSubscriberBootstraps = new WeakMap<
    OrbitDBDatabase,
    { outstanding: number; since: number }
  >();

  /**
   * Stores whose documents a register() has not yet replayed. A store whose
   * replay fails stays here until a later replay of it succeeds, so readiness
   * cannot open over state that was never replayed.
   */
  private readonly storesAwaitingReplay = new Set<OrbitDBDatabase>();

  /**
   * Networks whose head cache a register() has not yet rebuilt. A failed
   * rebuild leaves the network registered but unreconciled, so readiness cannot
   * open over heads that may be missing from the cache.
   */
  private readonly networksAwaitingHeadReconciliation = new Set<string>();

  private readonly reconciledStoreHeadSignatures = new WeakMap<
    OrbitDBDatabase,
    string
  >();

  private readonly storeHeadReconciliations = new WeakMap<
    OrbitDBDatabase,
    Promise<void>
  >();

  private readonly pendingStoreHeadReconciliations = new WeakMap<
    OrbitDBDatabase,
    OrbitDBPendingHeadReconciliation
  >();

  private readonly headRecordMergers = new Map<
    string,
    OrbitDBHeadRecordMerger
  >();

  private readonly headRecordScopes = new Map<string, OrbitDBHeadRecordScope>();

  private readonly headRepairPublishers = new Map<
    string,
    OrbitDBHeadRepairPublisher
  >();

  private readonly headWriteQueues = new Map<string, Promise<void>>();

  private readonly readmissions = new OrbitDBRecordReadmission();

  private readonly headReadmissions = new OrbitDBRecordReadmission();

  private readonly unverifiedHeads = new Map<string, UnverifiedHeads>();

  /**
   * Networks whose held heads overflowed, with the count of heads dropped.
   * It gates no read by itself: a read waits only on a key the network
   * dropped (see `droppedHeadKeys`). It clears once the held heads drained and
   * the network was rescanned in full without dropping again; the rescan
   * offers the dropped heads again.
   */
  private readonly overflowedHeadNetworks = new Map<string, number>();

  /**
   * The head keys each network settled: a head fully admitted with gated
   * records kept under a key its gate accepts proves its key, and a trivial,
   * empty, refused or ungoverned head never does. The entry only ever ungates
   * a read: it never makes one wait. A peer drives it, so it is bounded per
   * network (see `MAX_VERIFIED_HEAD_KEYS_PER_NETWORK`) and cleared with the
   * network.
   */
  private readonly verifiedHeadKeys = new Map<string, Set<string>>();

  /** Expiries of held head keys, per network and key (see `expiryKey`). */
  private readonly expiredHeadKeys = new Map<string, ExpiredHeadKey>();

  /**
   * The head keys each overflowed network dropped that are not ours, bounded
   * per network. A peer can drive it, so a key past the bound is not
   * remembered: it waits for nothing and is offered again by the rescan.
   */
  private readonly droppedHeadKeys = new Map<string, Set<string>>();

  /**
   * The head keys each overflowed network dropped that this node restored
   * from its own persisted head cache. Bounded by those persisted heads, so a
   * peer cannot crowd it, and the only dropped keys a list read waits on.
   */
  private readonly droppedRestoredHeadKeys = new Map<string, Set<string>>();

  /**
   * The head keys each network restored from this node's own persisted head
   * cache at start. Bounded by those persisted heads; a read of such a key
   * waits on its own network alone, and an eviction never takes one.
   */
  private readonly restoredHeadKeys = new Map<string, Set<string>>();

  private readonly pendingRecordCounts = new Map<string, number>();

  private lastPendingRecordLogAt = 0;

  private loggedNodeStarting = false;

  private readonly rescanningHeadNetworks = new Set<string>();

  private headRetryTimer?: NodeJS.Timeout;

  private headCache?: OrbitDBReplicatedHeadCache;

  private mutationGate?: OrbitDBMutationGate;

  private readonly headKeyDeriver = new OrbitDBReplicatedHeadKeyDeriver();

  private static defaultHeadCache(): OrbitDBReplicatedHeadCache | undefined {
    if (process.env.JEST_WORKER_ID || pigeonEnvironment().NODE_ENV === 'test') {
      return undefined;
    }

    return new LocalOrbitDBReplicatedHeadCache(new EmbeddedLocalDatabase());
  }

  public static withHeadCache(
    headCache: OrbitDBReplicatedHeadCache,
  ): OrbitDBReplicatedStateRegistry {
    const registry = new OrbitDBReplicatedStateRegistry();
    registry.headCache = headCache;

    return registry;
  }

  constructor() {
    this.headCache = OrbitDBReplicatedStateRegistry.defaultHeadCache();
  }

  private documentHistory(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): OrbitDBDocumentHistory | undefined {
    if (!this.historyStoreNames.has(storeName) || !store.log?.get)
      return undefined;

    let history = this.documentHistories.get(store);

    if (!history) {
      history = new OrbitDBDocumentHistory(
        store.log,
        async (value, scope) => {
          const document = this.recordValue(value);

          if (document) {
            await this.offerDocument(storeName, store, document, () =>
              this.notifyBootstrappedDocument(
                this.documentUpdateListeners.get(storeName) ?? new Set(),
                document,
                scope,
              ),
            );
          }
        },
        () => [...(this.historyObservers.get(storeName) ?? [])],
      );
      this.documentHistories.set(store, history);
    }

    return history;
  }

  private refreshDocumentHistory(
    store: OrbitDBDatabase,
    history: OrbitDBDocumentHistory,
  ): void {
    void history
      .refresh()
      .then(() => {
        this.storesAwaitingReplay.delete(store);
      })
      .catch(() => {
        Kernel.logger.warn?.('OrbitDB document history projection failed');
      });
  }

  private assertReady(): void {
    if (this.storesByNetworkId.size > 0) {
      this.loggedNodeStarting = false;

      return;
    }

    // Once per start, so a node that is opening is told apart from a hold a
    // peer induced (see `recordHeadDrop`) without a line per read.
    if (!this.loggedNodeStarting) {
      this.loggedNodeStarting = true;
      Kernel.logger.debug?.(
        'Node starting: replicated state is not ready, reads answer not ready',
      );
    }

    throw new ReplicatedStateNotReadyError();
  }

  private isStoreOverflowed(
    storeName: OrbitDBReplicatedDocumentStoreName,
    id: string,
  ): boolean {
    const subject = `${storeName}:${id}`;

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);

      if (store && this.readmissions.isOverflowedFor(store, subject)) {
        return true;
      }
    }

    return false;
  }

  private getStore(
    stores: OrbitDBPrivateNetworkStores,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): OrbitDBDatabase | undefined {
    return stores[storeName];
  }

  /** The stores of `stores` that have document listeners to replay into. */
  private listenedStores(
    stores: OrbitDBPrivateNetworkStores,
  ): OrbitDBDatabase[] {
    const listened: OrbitDBDatabase[] = [];

    for (const storeName of this.documentUpdateListeners.keys()) {
      const store = this.getStore(stores, storeName);

      if (store) listened.push(store);
    }

    return listened;
  }

  private isBootstrapDeferredAt(store: OrbitDBDatabase, now: number): boolean {
    const deferred = this.deferredSubscriberBootstraps.get(store);

    return (
      !!deferred &&
      now - deferred.since <
        OrbitDBReplicatedStateRegistry.DEFERRED_BOOTSTRAP_NOT_READY_MS
    );
  }

  /** A throw is treated as pending: a record is refused only by a verdict. */
  private async admitRecord(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<OrbitDBMutationVerdict> {
    const gate = this.mutationGate;

    if (!gate?.governs(collection)) return 'accepted';

    try {
      return await gate.verdictOf(collection, record);
    } catch {
      this.notePendingRecord(collection);

      return 'pending';
    }
  }

  /** Counts a pending record; the counts are logged once per interval. */
  private notePendingRecord(collection: string): void {
    this.pendingRecordCounts.set(
      collection,
      (this.pendingRecordCounts.get(collection) ?? 0) + 1,
    );

    const now = Date.now();

    if (now - this.lastPendingRecordLogAt < PENDING_RECORD_LOG_INTERVAL_MS) {
      return;
    }

    this.lastPendingRecordLogAt = now;
    const counts = [...this.pendingRecordCounts]
      .map(([name, count]) => `${name}=${count}`)
      .join(' ');

    this.pendingRecordCounts.clear();
    Kernel.logger.warn?.(`Replicated records not yet verified: ${counts}`);
  }

  /**
   * Any peer of a network can write to its stores, so a signed record naming
   * another network could be planted there to dodge the per-identity quotas
   * that network counts in its own store. A gated record that names a network
   * is only read from that network's store.
   */
  private isOfStoreNetwork(
    collection: string,
    record: Record<string, unknown>,
    storeNetworkId: string | undefined,
  ): boolean {
    return (
      typeof record.networkId !== 'string' ||
      record.networkId === storeNetworkId ||
      this.mutationGate?.governs(collection) !== true
    );
  }

  private async assertAdmitted(
    storeName: OrbitDBReplicatedDocumentStoreName,
    cleanDocument: Record<string, unknown>,
  ): Promise<void> {
    const verdict = await this.admitRecord(storeName, cleanDocument);

    if (verdict !== 'accepted') {
      throw new InvalidPublicMutationError();
    }
  }

  /**
   * A record can depend on another record of the same batch (an operation
   * lists its parents), so records not yet admitted are offered again while
   * the batch keeps admitting new ones. The order of the batch never matters.
   */
  private async admittedRecords(
    collection: string,
    records: Record<string, unknown>[],
  ): Promise<{
    admitted: Record<string, unknown>[];
    unproven: OrbitDBMutationVerdict[];
  }> {
    const admitted: Record<string, unknown>[] = [];
    let pending = records;
    let unproven: OrbitDBMutationVerdict[] = [];

    while (pending.length > 0) {
      const unadmitted: Record<string, unknown>[] = [];
      const verdicts: OrbitDBMutationVerdict[] = [];

      for (const record of pending) {
        const verdict = await this.admitRecord(collection, record);

        if (verdict === 'accepted') {
          admitted.push(record);
        } else {
          unadmitted.push(record);
          verdicts.push(verdict);
        }
      }

      unproven = verdicts;

      if (unadmitted.length === pending.length) break;

      pending = unadmitted;
    }

    return { admitted, unproven };
  }

  /**
   * Admits the gated records of a head. A pending record is withheld: the head
   * is held under its key until that record can be verified, and only its
   * admitted records are delivered, demoted, in the meantime. A head whose
   * gated records can never prove out is delivered demoted. A pending head
   * with no `readmission` has no key to be held under, so it is dropped, and
   * so is a head that cannot be held.
   */
  private async admitHead(
    value: Record<string, unknown>,
    readmission?: OrbitDBHeadReadmission,
  ): Promise<Record<string, unknown> | undefined> {
    if (!this.mutationGate) return value;

    const admission = await this.admitGatedCollections(value);

    if (admission.verdict === 'pending') {
      const part = withheldPart(admission);

      if (!readmission) return undefined;

      if (!this.holdUnverifiedHead(value, readmission, part)) return undefined;

      return part;
    }

    const delivered = deliveredHead(admission.admitted, admission.verdict);

    if (
      readmission &&
      (await this.acceptsDeliveredHead(
        admission,
        readmission.headKey,
        delivered,
      ))
    ) {
      this.settleHead(readmission, delivered, admission.kept > 0);
    }

    return delivered;
  }

  /**
   * A head is cached under its own key and under aliases derived from its
   * content, so a replicated head could otherwise be planted under the key of
   * any record. Keys a gate governs only receive heads the gate accepts.
   */
  private async admittedHeadKeys(
    keys: string[],
    value: Record<string, unknown>,
  ): Promise<string[]> {
    const gate = this.mutationGate;

    if (!gate) return keys;
    const admitted: string[] = [];

    for (const key of keys) {
      if (!gate.governsHead(key)) {
        admitted.push(key);
        continue;
      }

      try {
        if (await gate.acceptsHead(key, value)) admitted.push(key);
      } catch {
        // A gate that cannot decide (for example the identity or keychain gate
        // when IPFS fails) drops the head key: it is neither held nor retried.
        // The head is offered again when a peer sends it again.
        Kernel.logger.warn?.('Rejected unauthenticated replicated head');
      }
    }

    return admitted;
  }

  private async cacheReadmittedHead(
    networkId: string,
    headKey: string,
    value: Record<string, unknown>,
    persist: boolean = true,
  ): Promise<void> {
    const keys = await this.admittedHeadKeys(
      this.headKeyDeriver.cachedKeys(headKey, value),
      value,
    );

    for (const key of keys) {
      const cachedHead = this.cacheReplicatedHead(networkId, key, value);

      if (cachedHead && persist) {
        void this.persistHeadCache(networkId, key, cachedHead);
      }
    }
  }

  /**
   * A head's verdict is its worst gated record. A non-record item in a gated
   * list is refused: it can never prove out. An empty gated list has nothing
   * unproven, so it is accepted. `kept` counts the gated records admitted.
   */
  private async admitGatedCollections(
    value: Record<string, unknown>,
  ): Promise<GatedAdmission> {
    const admitted = { ...value };
    const verdicts: OrbitDBMutationVerdict[] = [];
    let kept = 0;

    for (const [collection, records] of Object.entries(value)) {
      if (!this.isGatedHeadCollection(collection, records)) continue;

      const stored = records.filter((record) => this.isRecord(record));
      const proven = await this.admittedRecords(collection, stored);

      if (stored.length !== records.length) verdicts.push('refused');

      verdicts.push(...proven.unproven);
      kept += proven.admitted.length;
      admitted[collection] = proven.admitted;
    }

    return { admitted, kept, verdict: worstVerdict(verdicts) };
  }

  /**
   * Holds a head whose gated records are pending under its head key and a
   * digest of its value, so a copy received again waits once. A head key
   * keeps its first copies up to a bound, and a key that expired unverified
   * is not held again for a while (see `MAX_HELD_COPY_AGE_MS`). A copy is
   * offered on every wake and every retry interval until the gate admits it
   * or its hold expires. A head that is not plain JSON has no digest, so it
   * is held under a fresh key. `delivered` is the admitted part already
   * delivered for the copy. Returns whether the head is held.
   */
  private holdUnverifiedHead(
    value: Record<string, unknown>,
    { headKey, networkId, onAdmitted, own }: OrbitDBHeadReadmission,
    delivered?: Record<string, unknown>,
  ): boolean {
    const heads: UnverifiedHeads =
      this.unverifiedHeads.get(networkId) ?? new Map();
    const copies: UnverifiedHeadCopies = heads.get(headKey) ?? new Map();
    const copyKey = this.unverifiedCopyKey(value);

    if (copies.has(copyKey)) return true;

    if (this.isCoolingDown(networkId, headKey)) return false;

    if (!this.canHoldHead(networkId, heads, headKey)) return false;

    // A full key keeps the copies it has: a flood of junk copies cannot evict
    // the copy that was held first. The refused copy overflows the network,
    // so it is offered again once the held copies expire or prove out.
    if (copies.size >= MAX_UNVERIFIED_COPIES_PER_HEAD) {
      this.recordHeadDrop(networkId, headKey);

      return false;
    }

    const deliveredKey = delivered && this.unverifiedCopyKey(delivered);
    const copy: UnverifiedHeadCopy = {
      delivered: deliveredKey,
      heldAt: Date.now(),
      onAdmitted,
      own: own === true,
      value,
    };

    copies.set(copyKey, copy);

    heads.set(headKey, copies);
    this.unverifiedHeads.set(networkId, heads);
    this.startHeadRetries();
    this.scheduleUnverifiedCopy(networkId, headKey, copyKey, copy);

    return true;
  }

  /**
   * A held head key keeps its copies; a new key needs a free active or queued
   * slot. Past both, the head is dropped and its network overflows.
   */
  private canHoldHead(
    networkId: string,
    heads: UnverifiedHeads,
    headKey: string,
  ): boolean {
    if (
      heads.has(headKey) ||
      heads.size <
        MAX_UNVERIFIED_HEADS_PER_NETWORK +
          MAX_QUEUED_UNVERIFIED_HEADS_PER_NETWORK
    ) {
      return true;
    }

    this.recordHeadDrop(networkId, headKey);

    return false;
  }

  /**
   * Counts a head that could not be held and remembers its key where a read
   * about it waits: a key this node restored always (bounded by its persisted
   * heads), any other up to a bound per network. Past the bound the key is
   * not remembered, so a flood of planted keys gates nothing; the rescan
   * offers the dropped heads again.
   */
  private recordHeadDrop(networkId: string, headKey: string): void {
    const dropped = (this.overflowedHeadNetworks.get(networkId) ?? 0) + 1;

    if (dropped === 1) {
      Kernel.logger.warn?.(
        'Peer-induced hold: held head bound reached, dropped heads are offered again once there is room',
      );
    }
    this.overflowedHeadNetworks.set(networkId, dropped);

    const own = this.isRestoredHead(networkId, headKey);
    const droppedByNetwork = own
      ? this.droppedRestoredHeadKeys
      : this.droppedHeadKeys;
    const keys = droppedByNetwork.get(networkId) ?? new Set<string>();

    if (own || keys.size < MAX_DROPPED_HEAD_KEYS_PER_NETWORK) {
      keys.add(headKey);
      droppedByNetwork.set(networkId, keys);
    }
    this.startHeadRetries();
  }

  private clearHeadOverflow(networkId: string): void {
    this.overflowedHeadNetworks.delete(networkId);
    this.droppedHeadKeys.delete(networkId);
    this.droppedRestoredHeadKeys.delete(networkId);
  }

  /** Key of a head key's expiry record: the same key in two networks differs. */
  private expiryKey(networkId: string, headKey: string): string {
    return `${networkId}\n${headKey}`;
  }

  /** Whether the head key expired unverified lately, or too often. */
  private isCoolingDown(networkId: string, headKey: string): boolean {
    const expired = this.expiredHeadKeys.get(
      this.expiryKey(networkId, headKey),
    );

    if (!expired) return false;

    return (
      expired.expiries >= MAX_HOLDS_PER_HEAD_KEY ||
      Date.now() - expired.at < MAX_HELD_COPY_AGE_MS
    );
  }

  /** Whether the held heads of a network leave room for a new key and copy. */
  private hasHeadRoom(networkId: string): boolean {
    const heads = this.unverifiedHeads.get(networkId);

    if (!heads) return true;

    if (heads.size >= MAX_UNVERIFIED_HEADS_PER_NETWORK) return false;

    for (const copies of heads.values()) {
      if (copies.size >= MAX_UNVERIFIED_COPIES_PER_HEAD) return false;
    }

    return true;
  }

  /**
   * Ends the hold of copies that waited too long. They stop gating reads and
   * are not held again, so a peer cannot keep a key unavailable.
   */
  private expireHeldCopies(): void {
    const oldest = Date.now() - MAX_HELD_COPY_AGE_MS;
    let expired = 0;

    for (const [networkId, heads] of this.unverifiedHeads) {
      for (const [headKey, copies] of heads) {
        expired += this.expireCopiesOf(networkId, headKey, copies, oldest);
        this.pruneUnverifiedHead(networkId, headKey);
      }
    }

    if (expired > 0) {
      Kernel.logger.warn?.(
        `Peer-induced hold: expired held head copies: count=${expired}`,
      );
    }
  }

  private expireCopiesOf(
    networkId: string,
    headKey: string,
    copies: UnverifiedHeadCopies,
    oldest: number,
  ): number {
    let expired = 0;

    for (const [copyKey, copy] of copies) {
      if (copy.heldAt > oldest) continue;

      copies.delete(copyKey);
      expired += 1;
    }

    if (expired > 0) this.rememberExpiredKey(networkId, headKey);

    return expired;
  }

  private rememberExpiredKey(networkId: string, headKey: string): void {
    const key = this.expiryKey(networkId, headKey);
    const previous = this.expiredHeadKeys.get(key);

    this.expiredHeadKeys.delete(key);
    this.expiredHeadKeys.set(key, {
      at: Date.now(),
      expiries: (previous?.expiries ?? 0) + 1,
    });

    for (const oldest of this.expiredHeadKeys.keys()) {
      if (this.expiredHeadKeys.size <= MAX_EXPIRED_KEYS_REMEMBERED) break;

      this.expiredHeadKeys.delete(oldest);
    }
  }

  private isHeadScopeOverflowed(): boolean {
    return this.overflowedHeadNetworks.size > 0;
  }

  /** Rescans each overflowed network whose held heads have drained. */
  private settleHeadOverflows(): void {
    for (const [networkId, dropped] of this.overflowedHeadNetworks) {
      if (
        !this.hasHeadRoom(networkId) ||
        this.rescanningHeadNetworks.has(networkId)
      ) {
        continue;
      }

      void this.rescanOverflowedHeads(networkId, dropped);
    }
  }

  private async rescanOverflowedHeads(
    networkId: string,
    dropped: number,
  ): Promise<void> {
    const stores = this.storesByNetworkId.get(networkId);

    if (!stores) {
      this.clearHeadOverflow(networkId);

      return;
    }

    this.rescanningHeadNetworks.add(networkId);

    try {
      await this.reconcileHeadCache(networkId, stores, undefined);

      if (this.overflowedHeadNetworks.get(networkId) === dropped) {
        this.clearHeadOverflow(networkId);
        Kernel.logger.warn?.(
          `Held head queue drained and rescanned: dropped=${dropped}`,
        );
      }
    } catch (error) {
      Kernel.logger.warn?.(
        `Held head rescan failed: error=${errorClassName(error)}`,
      );
    } finally {
      this.rescanningHeadNetworks.delete(networkId);
    }
  }

  private scheduleUnverifiedCopy(
    networkId: string,
    headKey: string,
    copyKey: UnverifiedCopyKey,
    copy: UnverifiedHeadCopy,
  ): void {
    this.headReadmissions.schedule({
      isCurrent: () => this.storesByNetworkId.has(networkId),
      key: typeof copyKey === 'string' ? `${headKey}:${copyKey}` : undefined,
      offer: () => this.offerUnverifiedCopy(networkId, headKey, copyKey, copy),
      scope: networkId,
      subject: headKey,
    });
  }

  private async offerUnverifiedCopy(
    networkId: string,
    headKey: string,
    copyKey: UnverifiedCopyKey,
    copy: UnverifiedHeadCopy,
  ): Promise<boolean> {
    // Superseded, evicted, or unregistered since it was scheduled.
    if (this.unverifiedCopiesOf(networkId, headKey)?.get(copyKey) !== copy) {
      return true;
    }

    const admission = await this.admitGatedCollections(copy.value);

    if (admission.verdict === 'pending') {
      // The admitted part is delivered whenever it changes, so a record that
      // proves out is not held back by a sibling that is still pending.
      const part = withheldPart(admission);
      const partKey = part && this.unverifiedCopyKey(part);

      if (part && partKey !== copy.delivered) {
        copy.delivered = partKey;
        await copy.onAdmitted(part);
      }

      return false;
    }

    await this.finishOffer(networkId, headKey, copyKey, copy, admission);

    return true;
  }

  /** Delivers a fully decided copy and settles its key when it is accepted. */
  private async finishOffer(
    networkId: string,
    headKey: string,
    copyKey: UnverifiedCopyKey,
    copy: UnverifiedHeadCopy,
    admission: GatedAdmission,
  ): Promise<void> {
    const delivered = deliveredHead(admission.admitted, admission.verdict);
    const accepted = await this.acceptsDeliveredHead(
      admission,
      headKey,
      delivered,
    );

    await copy.onAdmitted(delivered);
    this.unverifiedCopiesOf(networkId, headKey)?.delete(copyKey);

    if (accepted) {
      this.settleHead(
        { headKey, networkId, own: copy.own },
        delivered,
        admission.kept > 0,
      );
    } else {
      this.pruneUnverifiedHead(networkId, headKey);
    }
  }

  /**
   * Drops the held copies of a head that an admitted `value` supersedes: the
   * copies not newer than it. A newer copy stays held, so the head keeps
   * waiting for the state it rests on.
   */
  private supersedeUnverifiedCopies(
    networkId: string,
    headKey: string,
    value: Record<string, unknown>,
  ): void {
    const copies = this.unverifiedCopiesOf(networkId, headKey);
    const updatedAt = updatedAtOf(value);

    if (!copies) return;

    if (updatedAt !== undefined) {
      for (const [copyKey, copy] of copies) {
        const copyUpdatedAt = updatedAtOf(copy.value);

        if (copyUpdatedAt !== undefined && copyUpdatedAt <= updatedAt) {
          copies.delete(copyKey);
        }
      }
    }

    this.pruneUnverifiedHead(networkId, headKey);
  }

  private unverifiedCopiesOf(
    networkId: string,
    headKey: string,
  ): UnverifiedHeadCopies | undefined {
    return this.unverifiedHeads.get(networkId)?.get(headKey);
  }

  private pruneUnverifiedHead(networkId: string, headKey: string): void {
    const heads = this.unverifiedHeads.get(networkId);

    if (!heads) return;

    if (heads.get(headKey)?.size === 0) heads.delete(headKey);

    if (heads.size === 0) {
      this.unverifiedHeads.delete(networkId);
      this.settleHeadOverflows();
    }
  }

  /**
   * Whether a head is accepted in full under a key its gate accepts. A
   * refused head, or one under a key its gate rejects, is not.
   */
  private async acceptsDeliveredHead(
    admission: GatedAdmission,
    headKey: string,
    delivered: Record<string, unknown>,
  ): Promise<boolean> {
    if (admission.verdict !== 'accepted') return false;

    return (await this.admittedHeadKeys([headKey], delivered)).length > 0;
  }

  /**
   * Settles a head key in a network with an accepted head: the copies it
   * supersedes are dropped, and a head that also kept gated records (it
   * `proves` the key) verifies it. A trivial or empty head verifies nothing.
   * A key whose restored own copy still waits is settled by that copy alone
   * (or by its expiry): a head a peer offers, in any network, neither
   * verifies it nor supersedes the copy.
   */
  private settleHead(
    {
      headKey,
      networkId,
      own,
    }: Pick<OrbitDBHeadReadmission, 'headKey' | 'networkId' | 'own'>,
    delivered: Record<string, unknown>,
    proves: boolean,
  ): void {
    if (!own && this.hasPendingOwnCopy(networkId, headKey)) {
      this.pruneUnverifiedHead(networkId, headKey);

      return;
    }

    if (proves) this.markVerifiedHead(networkId, headKey);

    this.supersedeUnverifiedCopies(networkId, headKey, delivered);
  }

  /** Whether a restored own copy of the key still waits in the network. */
  private hasPendingOwnCopy(networkId: string, headKey: string): boolean {
    if (this.isVerifiedHead(networkId, headKey)) return false;

    if (this.droppedRestoredHeadKeys.get(networkId)?.has(headKey)) return true;

    const copies = this.unverifiedCopiesOf(networkId, headKey);

    return (
      copies !== undefined && [...copies.values()].some((copy) => copy.own)
    );
  }

  private isVerifiedHead(networkId: string, headKey: string): boolean {
    return this.verifiedHeadKeys.get(networkId)?.has(headKey) ?? false;
  }

  private isVerifiedAnywhere(headKey: string): boolean {
    for (const keys of this.verifiedHeadKeys.values()) {
      if (keys.has(headKey)) return true;
    }

    return false;
  }

  private isRestoredHead(networkId: string, headKey: string): boolean {
    return this.restoredHeadKeys.get(networkId)?.has(headKey) ?? false;
  }

  private markRestoredHead(networkId: string, headKey: string): void {
    const keys = this.restoredHeadKeys.get(networkId) ?? new Set<string>();

    keys.add(headKey);
    this.restoredHeadKeys.set(networkId, keys);
  }

  /**
   * Remembers that a network settled a head key. Past the bound the oldest
   * keys go first, never a key restored from this node's own cache.
   */
  private markVerifiedHead(networkId: string, headKey: string): void {
    const keys = this.verifiedHeadKeys.get(networkId) ?? new Set<string>();

    keys.delete(headKey);
    keys.add(headKey);
    this.verifiedHeadKeys.set(networkId, keys);

    for (const oldest of keys) {
      if (keys.size <= MAX_VERIFIED_HEAD_KEYS_PER_NETWORK) break;

      if (!this.isRestoredHead(networkId, oldest)) keys.delete(oldest);
    }
  }

  /**
   * Whether a read of the key must wait. Per network, a key waits while a
   * copy of it is held, or a head of it was dropped, and the network has not
   * settled it. A key restored from this node's own cache waits on its own
   * network alone: nothing a peer offers in another network ends the wait.
   * Any other key waits only while no network has settled it, so a copy a
   * peer plants under a key this node settled cannot make it unavailable. A
   * network that overflowed delays only the keys it dropped and remembers.
   */
  private awaitsVerifiedHead(headKey: string): boolean {
    let unsettled = false;

    for (const networkId of this.unsettledNetworks(headKey)) {
      if (this.isRestoredHead(networkId, headKey)) return true;

      unsettled = true;
    }

    return unsettled && !this.isVerifiedAnywhere(headKey);
  }

  /** The networks that hold a copy of the key, or dropped one, unsettled. */
  private *unsettledNetworks(headKey: string): Generator<string> {
    const networkIds = [
      ...this.unverifiedHeads.keys(),
      ...this.droppedHeadKeys.keys(),
      ...this.droppedRestoredHeadKeys.keys(),
    ];

    for (const networkId of networkIds) {
      if (this.isUnsettledHere(networkId, headKey)) yield networkId;
    }
  }

  /** Whether the network holds or dropped a copy of the key, unverified. */
  private isUnsettledHere(networkId: string, headKey: string): boolean {
    return (
      !this.isVerifiedHead(networkId, headKey) &&
      (this.unverifiedHeads.get(networkId)?.has(headKey) === true ||
        this.droppedHeadKeys.get(networkId)?.has(headKey) === true ||
        this.droppedRestoredHeadKeys.get(networkId)?.has(headKey) === true)
    );
  }

  private unverifiedCopyKey(value: Record<string, unknown>): UnverifiedCopyKey {
    try {
      return StateDigest.of(value);
    } catch {
      return Symbol('unverified head');
    }
  }

  /**
   * Offers the held copies of every head with no offer pending, on wake and
   * on each retry interval, until a copy is admitted or its hold expires.
   */
  private retryUnverifiedHeads(): void {
    this.expireHeldCopies();
    this.settleHeadOverflows();

    if (this.unverifiedHeads.size === 0 && !this.isHeadScopeOverflowed()) {
      this.stopHeadRetries();

      return;
    }

    for (const [networkId, heads] of this.unverifiedHeads) {
      this.offerIdleHeads(networkId, heads);
    }
  }

  private offerIdleHeads(networkId: string, heads: UnverifiedHeads): void {
    for (const [headKey, copies] of heads) {
      if (this.headReadmissions.isPending(headKey)) continue;

      for (const [copyKey, copy] of copies) {
        this.scheduleUnverifiedCopy(networkId, headKey, copyKey, copy);
      }
    }
  }

  private startHeadRetries(): void {
    if (this.headRetryTimer) return;

    this.headRetryTimer = setInterval(
      () => this.retryUnverifiedHeads(),
      HEAD_RETRY_INTERVAL_MS,
    );
    this.headRetryTimer.unref();
  }

  private stopHeadRetries(): void {
    clearInterval(this.headRetryTimer);
    this.headRetryTimer = undefined;
  }

  private cachedHeadReadmission(
    networkId: string,
    headKey: string,
    own: boolean = false,
  ): OrbitDBHeadReadmission {
    return {
      headKey,
      networkId,
      onAdmitted: (admitted) =>
        this.cacheReadmittedHead(networkId, headKey, admitted),
      own,
    };
  }

  /**
   * Admitted state can be what a rejected record or a held head rests on.
   */
  private wakeReadmissions(): void {
    this.readmissions.wake();
    this.retryUnverifiedHeads();
    this.headReadmissions.wake();
  }

  private isGatedHeadCollection(
    collection: string,
    records: unknown,
  ): records is unknown[] {
    return (
      Array.isArray(records) &&
      OrbitDBReplicatedStateRegistry.INDEX_HEAD_COLLECTION_NAMES.has(
        collection,
      ) &&
      this.mutationGate?.governs(collection) === true
    );
  }

  private async admittedStoreRecords(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): Promise<Array<{ key?: string; value: Record<string, unknown> }>> {
    const admitted: Array<{ key?: string; value: Record<string, unknown> }> =
      [];

    const networkId = this.networkIdOfStore(storeName, store);

    for (const record of await this.allRecords(store)) {
      if (
        this.isOfStoreNetwork(storeName, record.value, networkId) &&
        (await this.admitRecord(storeName, record.value)) === 'accepted'
      )
        admitted.push(record);
    }

    return admitted;
  }

  private async allRecords(store: OrbitDBDatabase): Promise<
    Array<{
      key?: string;
      value: Record<string, unknown>;
    }>
  > {
    const entries = await store.all?.();

    return (entries || [])
      .filter(
        (
          entry,
        ): entry is {
          key?: string;
          value: Record<string, unknown>;
        } =>
          typeof entry.value === 'object' &&
          entry.value !== null &&
          !Array.isArray(entry.value),
      )
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
      }));
  }

  private async notifyDocumentUpdated(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    value: unknown,
  ): Promise<void> {
    const document = this.recordValue(value);

    if (document) {
      await this.offerDocument(storeName, store, document, () =>
        this.notifyDocumentListeners(storeName, document),
      );
    }
  }

  private notifyDocumentListeners(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
  ): void {
    for (const listener of this.documentUpdateListeners.get(storeName) ?? []) {
      void Promise.resolve(listener(document)).catch((error) => {
        Kernel.logger.warn?.(
          `OrbitDB document projection failed: store=${storeName} error=${errorClassName(error)}`,
        );
      });
    }
  }

  private networkIdOfStore(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): string | undefined {
    for (const [networkId, stores] of this.storesByNetworkId) {
      if (this.getStore(stores, storeName) === store) return networkId;
    }

    return undefined;
  }

  private async offerDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    document: Record<string, unknown>,
    deliver: () => void | Promise<void>,
  ): Promise<void> {
    if (
      !this.isOfStoreNetwork(
        storeName,
        document,
        this.networkIdOfStore(storeName, store),
      )
    )
      return;

    const verdict = await this.admitRecord(storeName, document);

    if (verdict === 'accepted') {
      await deliver();
      this.wakeReadmissions();

      return;
    }

    // Refused documents can never prove out: dropped, not offered again.
    if (verdict === 'refused') return;

    this.readmissions.schedule({
      isCurrent: () => this.networkIdOfStore(storeName, store) !== undefined,
      offer: async (): Promise<boolean> => {
        const latest = await this.admitRecord(storeName, document);

        if (latest === 'pending') return false;

        // A refused document is retired without delivery.
        if (latest === 'refused') return true;
        await deliver();
        this.wakeReadmissions();

        return true;
      },
      reconcile: async (): Promise<void> => {
        if (this.networkIdOfStore(storeName, store) === undefined) return;

        await this.projectCanonicalDocuments(storeName, store);
      },
      scope: store,
      subject:
        typeof document.id === 'string'
          ? `${storeName}:${document.id}`
          : undefined,
    });
  }

  private headSignature(heads: OrbitDBEntry[] | undefined): string | undefined {
    if (!heads) {
      return undefined;
    }

    const hashes = heads
      .map((head) => head.hash)
      .filter((hash): hash is string => typeof hash === 'string')
      .sort();

    return hashes.length === heads.length ? JSON.stringify(hashes) : undefined;
  }

  private reconcileDocumentProjection(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    heads: OrbitDBEntry[] | undefined,
  ): void {
    this.reconcileStoreAfterHeadExchange(
      store,
      heads,
      `document projection store=${storeName}`,
      async (): Promise<void> =>
        this.projectCanonicalDocuments(storeName, store),
    );
  }

  private reconcileStoreAfterHeadExchange(
    store: OrbitDBDatabase,
    heads: OrbitDBEntry[] | undefined,
    scope: string,
    reconcile: (headSignature: string | undefined) => Promise<void>,
  ): void {
    const headSignature = this.headSignature(heads);

    if (
      headSignature &&
      this.reconciledStoreHeadSignatures.get(store) === headSignature
    ) {
      return;
    }

    this.pendingStoreHeadReconciliations.set(store, {
      headSignature,
      reconcile,
      scope,
    });
    this.startStoreHeadReconciliation(store);
  }

  private startStoreHeadReconciliation(store: OrbitDBDatabase): void {
    if (this.storeHeadReconciliations.has(store)) {
      return;
    }

    const reconciliation = this.drainStoreHeadReconciliations(store).finally(
      () => {
        if (this.storeHeadReconciliations.get(store) === reconciliation) {
          this.storeHeadReconciliations.delete(store);
        }

        if (this.pendingStoreHeadReconciliations.has(store)) {
          this.startStoreHeadReconciliation(store);
        }
      },
    );

    this.storeHeadReconciliations.set(store, reconciliation);
  }

  private async drainStoreHeadReconciliations(
    store: OrbitDBDatabase,
  ): Promise<void> {
    while (this.pendingStoreHeadReconciliations.has(store)) {
      const pending = this.pendingStoreHeadReconciliations.get(store);
      this.pendingStoreHeadReconciliations.delete(store);

      if (!pending) {
        continue;
      }

      if (
        pending.headSignature &&
        this.reconciledStoreHeadSignatures.get(store) === pending.headSignature
      ) {
        continue;
      }

      try {
        await pending.reconcile(pending.headSignature);
      } catch (error) {
        Kernel.logger.warn?.(
          `OrbitDB head reconciliation failed: scope=${pending.scope}` +
            ` error=${errorClassName(error)}`,
        );

        continue;
      }

      if (pending.headSignature) {
        this.reconciledStoreHeadSignatures.set(store, pending.headSignature);
      }
    }
  }

  private async projectCanonicalDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): Promise<void> {
    const listeners = this.documentUpdateListeners.get(storeName);

    if (!listeners || listeners.size === 0) {
      return;
    }

    const startedAt = process.hrtime.bigint();
    const projectedDocuments = await this.bootstrapDocumentUpdateListener(
      storeName,
      store,
      listeners,
    );
    this.storesAwaitingReplay.delete(store);
    const elapsedMilliseconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    Kernel.logger.debug?.(
      `OrbitDB document projection reconciled: store=${storeName}` +
        ` documents=${projectedDocuments}` +
        ` durationMs=${elapsedMilliseconds.toFixed(3)}`,
    );
  }

  private registerDocumentUpdateListener(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): void {
    const registeredStores =
      this.documentUpdateListenerStores.get(storeName) ?? new WeakSet();

    if (registeredStores.has(store)) {
      return;
    }

    store.events?.on?.('update', (entry) => {
      const history = this.documentHistory(storeName, store);

      this.retryPendingSubscriberBootstraps(storeName, store);

      if (history) this.refreshDocumentHistory(store, history);
      else
        void this.notifyDocumentUpdated(storeName, store, entry.payload?.value);
    });
    store.events?.on?.('join', (_peerId, heads) => {
      const history = this.documentHistory(storeName, store);

      this.retryPendingSubscriberBootstraps(storeName, store);

      if (history) this.refreshDocumentHistory(store, history);
      else this.reconcileDocumentProjection(storeName, store, heads);
    });
    registeredStores.add(store);
    this.documentUpdateListenerStores.set(storeName, registeredStores);
  }

  private registerDocumentUpdateListeners(
    stores: OrbitDBPrivateNetworkStores,
  ): void {
    for (const storeName of this.documentUpdateListeners.keys()) {
      const store = this.getStore(stores, storeName);

      if (store) {
        this.registerDocumentUpdateListener(storeName, store);
      }
    }
  }

  /**
   * Bootstraps a new subscriber. A block the store cannot load in time (a
   * restarted node missing blocks only its peers serve) defers the bootstrap
   * to the store's next head update instead of failing the subscription.
   */
  private async bootstrapSubscriber(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    bootstrap: () => Promise<void>,
  ): Promise<void> {
    try {
      await bootstrap();
    } catch (error: unknown) {
      if (!isOrbitDBTransientBlockError(error)) throw error;

      const deferred = this.deferredSubscriberBootstraps.get(store) ?? {
        outstanding: 0,
        since: Date.now(),
      };

      deferred.outstanding++;
      this.deferredSubscriberBootstraps.set(store, deferred);
      this.deferSubscriberBootstrap(storeName, store, bootstrap, error);
    }
  }

  private deferSubscriberBootstrap(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    bootstrap: () => Promise<void>,
    error: unknown,
  ): void {
    const pending = this.pendingSubscriberBootstraps.get(store) ?? [];

    pending.push(bootstrap);
    this.pendingSubscriberBootstraps.set(store, pending);
    Kernel.logger.warn?.(
      `OrbitDB document subscriber bootstrap deferred: store=${storeName}` +
        ` error=${errorClassName(error)}` +
        ' recovery=retry-on-store-head-update',
    );
  }

  private settleSubscriberBootstrap(store: OrbitDBDatabase): void {
    const deferred = this.deferredSubscriberBootstraps.get(store);

    if (!deferred) return;

    deferred.outstanding--;

    if (deferred.outstanding <= 0)
      this.deferredSubscriberBootstraps.delete(store);
  }

  private retryPendingSubscriberBootstraps(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): void {
    const pending = this.pendingSubscriberBootstraps.get(store);

    if (!pending) return;

    this.pendingSubscriberBootstraps.delete(store);
    for (const bootstrap of pending) {
      void bootstrap().then(
        () => this.settleSubscriberBootstrap(store),
        (error: unknown) => {
          if (isOrbitDBTransientBlockError(error)) {
            this.deferSubscriberBootstrap(storeName, store, bootstrap, error);

            return;
          }

          this.settleSubscriberBootstrap(store);
          Kernel.logger.warn?.(
            `OrbitDB document subscriber bootstrap failed: store=${storeName}` +
              ` error=${errorClassName(error)}`,
          );
        },
      );
    }
  }

  private async notifyBootstrappedDocument(
    listeners: Set<
      (
        document: Record<string, unknown>,
        scope?: object,
      ) => void | Promise<void>
    >,
    document: Record<string, unknown>,
    scope?: object,
  ): Promise<void> {
    for (const listener of listeners) {
      if (scope) await listener(document, scope);
      else await listener(document);
    }
  }

  private async yieldAfterHydrationBatch(index: number): Promise<void> {
    if (
      (index + 1) % OrbitDBReplicatedStateRegistry.HYDRATION_BATCH_SIZE !==
      0
    ) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  private async bootstrapDocumentUpdateListener(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    listeners: Set<
      (
        document: Record<string, unknown>,
        scope?: object,
      ) => void | Promise<void>
    >,
  ): Promise<number> {
    const records = await this.admittedStoreRecords(storeName, store);

    for (let index = 0; index < records.length; index++) {
      await this.notifyBootstrappedDocument(listeners, records[index].value);
      await this.yieldAfterHydrationBatch(index);
    }

    return records.length;
  }

  private async bootstrapSubscribedDocumentListener(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    listener: (
      document: Record<string, unknown>,
      scope?: object,
    ) => void | Promise<void>,
    observer?: OrbitDBHistoryReplayObserver,
  ): Promise<void> {
    const existingHistory = this.documentHistories.has(store);
    const history = this.documentHistory(storeName, store);

    if (history && existingHistory && store.log) {
      await new OrbitDBDocumentHistory(
        store.log,
        async (value, scope) => {
          const document = this.recordValue(value);

          if (document) {
            await this.offerDocument(storeName, store, document, () =>
              listener(document, scope),
            );
          }
        },
        () => (observer ? [observer] : []),
      ).refresh();
    } else if (history) {
      await history.refresh();
    } else {
      await this.bootstrapDocumentUpdateListener(
        storeName,
        store,
        new Set([listener]),
      );
    }
  }

  private async bootstrapDocumentUpdateListeners(
    stores: OrbitDBPrivateNetworkStores,
  ): Promise<void> {
    for (const [storeName, listeners] of this.documentUpdateListeners) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }

      const history = this.documentHistory(storeName, store);

      if (history) await history.refresh();
      else {
        await this.bootstrapDocumentUpdateListener(storeName, store, listeners);
      }
      this.storesAwaitingReplay.delete(store);
    }
  }

  private async hydrateHeadRecord(
    networkId: string,
    record: { key?: string; value: Record<string, unknown> },
  ): Promise<boolean> {
    if (!record.key) {
      return true;
    }

    this.markPersistedHeadKey(networkId, record.key);

    const recordKey = record.key;
    const value = await this.admitHead(
      record.value,
      this.cachedHeadReadmission(networkId, recordKey),
    );

    // Held until admitted: there is nothing to persist yet, and onAdmitted
    // persists the head once it is.
    if (!value) return true;

    let persisted = true;

    const keys = await this.admittedHeadKeys(
      this.headKeyDeriver.cachedKeys(record.key, value),
      value,
    );

    for (const key of keys) {
      const cachedHead = this.cacheReplicatedHead(networkId, key, value);

      if (cachedHead) {
        persisted =
          (await this.persistHeadCache(networkId, key, cachedHead)) &&
          persisted;
      }
    }

    return persisted;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private recordValue(
    entry: { value?: unknown } | unknown,
  ): Record<string, unknown> | undefined {
    if (this.isRecord(entry) && 'value' in entry) {
      return this.isRecord(entry.value) ? entry.value : undefined;
    }

    return this.isRecord(entry) ? entry : undefined;
  }

  private headRecordCollectionNames(
    document: Record<string, unknown>,
  ): string[] {
    return Object.entries(document)
      .filter(
        ([key, value]) =>
          OrbitDBReplicatedStateRegistry.INDEX_HEAD_COLLECTION_NAMES.has(key) &&
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((item) => this.isRecord(item)),
      )
      .map(([key]) => key);
  }

  private sharedHeadRecordCollectionName(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): string | undefined {
    const currentNames = new Set(this.headRecordCollectionNames(current));
    const candidateNames = this.headRecordCollectionNames(candidate).filter(
      (name) => currentNames.has(name),
    );

    return candidateNames.length === 1 ? candidateNames[0] : undefined;
  }

  private recordId(record: Record<string, unknown>): string | undefined {
    return (
      this.stringValue(record, 'id') ||
      this.stringValue(record, 'messageId') ||
      this.stringValue(record, 'rootMessageId')
    );
  }

  private mergeHeadRecords(
    currentRecords: Record<string, unknown>[],
    candidateRecords: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const merged = new Map<string, Record<string, unknown>>();
    const withoutId: Record<string, unknown>[] = [];

    for (const record of [...currentRecords, ...candidateRecords]) {
      const id = this.recordId(record);

      if (!id) {
        withoutId.push(record);

        continue;
      }

      const current = merged.get(id);

      if (!current || this.isNewerOrEqualDocument(current, record)) {
        merged.set(id, record);
      }
    }

    return [...withoutId, ...merged.values()];
  }

  private mergeHeadRecordCollection(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    const collectionName = this.sharedHeadRecordCollectionName(
      current,
      candidate,
    );

    if (!collectionName) {
      return candidate;
    }

    const currentRecords = current[collectionName] as Record<string, unknown>[];
    const candidateRecords = candidate[collectionName] as Record<
      string,
      unknown
    >[];

    return {
      ...candidate,
      [collectionName]: this.mergeHeadRecords(currentRecords, candidateRecords),
      updatedAt: Math.max(
        this.documentFreshness(current),
        this.documentFreshness(candidate),
      ),
    };
  }

  private mergeHeadRecord(
    key: string,
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const prefix = [...this.headRecordMergers.keys()].find((value) =>
      key.startsWith(value),
    );
    const merger =
      prefix === undefined ? undefined : this.headRecordMergers.get(prefix);

    if (!merger)
      return current
        ? this.mergeHeadRecordCollection(current, candidate)
        : candidate;
    try {
      return merger(current, candidate);
    } catch {
      Kernel.logger.warn?.('Rejected incompatible replicated state');

      return current;
    }
  }

  private cacheHeadIn(
    cache: Map<string, Record<string, unknown>>,
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const current = cache.get(key);
    const candidate = this.mergeHeadRecord(key, current, value);

    if (!candidate) return undefined;
    const accepted =
      !current ||
      this.isMergeableHeadKey(key) ||
      this.isNewerOrEqualDocument(current, candidate);

    if (accepted) {
      cache.set(key, candidate);
      this.wakeReadmissions();

      return candidate;
    }

    return undefined;
  }

  private replicatedHeads(
    networkId: string,
  ): Map<string, Record<string, unknown>> {
    const rebuilding = this.rebuildingHeadsByNetworkId.get(networkId);

    if (rebuilding) return rebuilding;
    const heads =
      this.replicatedHeadsByNetworkId.get(networkId) ??
      new Map<string, Record<string, unknown>>();

    this.replicatedHeadsByNetworkId.set(networkId, heads);

    return heads;
  }

  private readableHeadMaps(): Array<Map<string, Record<string, unknown>>> {
    return [
      ...this.replicatedHeadsByNetworkId.values(),
      ...this.rebuildingHeadsByNetworkId.values(),
    ];
  }

  private scopedHeadRecord(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const prefix = [...this.headRecordScopes.keys()].find((candidate) =>
      key.startsWith(candidate),
    );

    if (prefix === undefined) return value;
    try {
      return this.headRecordScopes.get(prefix)!(networkId, value);
    } catch {
      Kernel.logger.warn?.('Rejected incompatible network-scoped head');

      return undefined;
    }
  }

  private async persistNetworkHead(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
    key: string,
    value: Record<string, unknown>,
    replace: boolean = false,
  ): Promise<void> {
    const scoped = this.scopedHeadRecord(networkId, key, value);

    if (!scoped) return;
    await stores.heads.put?.(key, scoped);

    if (replace) {
      this.replicatedHeads(networkId).set(key, scoped);
    } else {
      this.cacheReplicatedHead(networkId, key, scoped);
    }
    this.markPersistedHeadKey(networkId, key);
    await this.persistHeadCache(networkId, key, scoped);
  }

  private cacheReplicatedHead(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const scoped = this.scopedHeadRecord(networkId, key, value);

    return scoped
      ? this.cacheHeadIn(this.replicatedHeads(networkId), key, scoped)
      : undefined;
  }

  private cacheProjectedHead(
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    return this.cacheHeadIn(this.projectedHeads, key, value);
  }

  private cacheExactProjectedHead(
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    this.projectedHeads.set(key, value);
    this.exactProjectedHeadKeys.add(key);

    return value;
  }

  private removeProjectedHead(
    key: string,
    projectedHead: Record<string, unknown> | undefined,
  ): void {
    if (projectedHead && this.projectedHeads.get(key) === projectedHead) {
      this.projectedHeads.delete(key);
      this.exactProjectedHeadKeys.delete(key);
    }
  }

  private cachedHead(key: string): Record<string, unknown> | undefined {
    if (this.exactProjectedHeadKeys.has(key)) {
      return this.projectedHeads.get(key);
    }

    const candidates = [
      ...this.readableHeadMaps().map((heads) => heads.get(key)),
      this.projectedHeads.get(key),
    ].filter(
      (candidate): candidate is Record<string, unknown> =>
        candidate !== undefined,
    );

    return candidates.reduce<Record<string, unknown> | undefined>(
      (current, candidate) => {
        if (!current) {
          return candidate;
        }

        const merged = this.mergeHeadRecord(key, current, candidate);

        return merged &&
          (this.isMergeableHeadKey(key) ||
            this.isNewerOrEqualDocument(current, merged))
          ? merged
          : current;
      },
      undefined,
    );
  }

  private cachedHeadKeys(): Set<string> {
    return new Set([
      ...this.projectedHeads.keys(),
      ...this.readableHeadMaps().flatMap((heads) => [...heads.keys()]),
    ]);
  }

  private headKeysFromUpdate(
    networkId: string,
    entry: { payload?: { key?: string } },
    record: Record<string, unknown>,
  ): string[] {
    const explicitKey = entry.payload?.key;

    if (explicitKey) {
      this.markPersistedHeadKey(networkId, explicitKey);

      return this.headKeyDeriver.cachedKeys(explicitKey, record);
    }

    return this.headKeyDeriver.implicitKeys(record);
  }

  private persistMergedHead(
    networkId: string,
    key: string,
    received: Record<string, unknown>,
    merged: Record<string, unknown>,
  ): void {
    const prefix = [...this.headRecordMergers.keys()].find((candidate) =>
      key.startsWith(candidate),
    );

    if (!prefix) return;

    if (this.isSameHeadContent(received, merged)) return;
    const publisher = this.headRepairPublishers.get(prefix);

    if (publisher) {
      publisher(networkId, key, merged);

      return;
    }

    this.replicateHeadInBackground(key, merged, [networkId], true);
  }

  private async cacheHeadUpdate(
    networkId: string,
    entry: { payload?: { key?: string; value?: unknown } },
  ): Promise<void> {
    const payloadValue = entry.payload?.value;

    if (!this.isRecord(payloadValue)) {
      return;
    }

    const received = this.recordValue(payloadValue);

    if (!received) {
      return;
    }

    const apply = (record: Record<string, unknown>, keys: string[]): void => {
      for (const key of keys) {
        const cachedHead = this.cacheReplicatedHead(networkId, key, record);

        if (cachedHead) {
          void this.persistHeadCache(networkId, key, cachedHead);
          this.persistMergedHead(networkId, key, record, cachedHead);
        }
      }
    };

    if (!this.mutationGate) {
      apply(received, this.headKeysFromUpdate(networkId, entry, received));

      return;
    }

    const gated = async (record: Record<string, unknown>): Promise<void> =>
      apply(
        record,
        await this.admittedHeadKeys(
          this.headKeysFromUpdate(networkId, entry, record),
          record,
        ),
      );

    const key = entry.payload?.key;

    const admitted = await this.admitHead(
      received,
      key === undefined
        ? undefined
        : { headKey: key, networkId, onAdmitted: gated },
    );

    if (admitted) await gated(admitted);
  }

  private isMergeableHeadKey(key: unknown): key is string {
    return (
      typeof key === 'string' &&
      [...this.headRecordMergers.keys()].some((prefix) =>
        key.startsWith(prefix),
      )
    );
  }

  private async hydrateMergeableHeadHistory(
    networkId: string,
    store: OrbitDBDatabase,
  ): Promise<void> {
    if (!store.log?.get || this.headRecordMergers.size === 0) return;

    for await (const entry of new OrbitDBHeadHistoryReader(
      store.log,
    ).entries()) {
      const { key, value } = entry.payload ?? {};

      if (!this.isMergeableHeadKey(key) || !this.isRecord(value)) continue;
      await this.hydrateHeadRecord(networkId, { key, value });
    }
  }

  private async hydrateHeadKeyHistory(
    networkId: string,
    store: OrbitDBDatabase,
    key: string,
  ): Promise<void> {
    if (!store.log?.get) return;

    for await (const entry of new OrbitDBHeadHistoryReader(
      store.log,
    ).entries()) {
      const { value } = entry.payload ?? {};

      if (entry.payload?.key === key && this.isRecord(value)) {
        await this.hydrateHeadRecord(networkId, { key, value });
      }
    }
  }

  private async hydrateHeadCache(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
    reconciledHeadSignature?: string,
  ): Promise<number> {
    await this.hydrateMergeableHeadHistory(networkId, stores.heads);
    const records = await this.allRecords(stores.heads);
    let persistedAllHeads = true;

    for (let index = 0; index < records.length; index++) {
      persistedAllHeads =
        (await this.hydrateHeadRecord(networkId, records[index])) &&
        persistedAllHeads;

      const { key, value } = records[index];
      const merged = key ? this.replicatedHeads(networkId).get(key) : undefined;

      if (key && merged) this.persistMergedHead(networkId, key, value, merged);
      await this.yieldAfterHydrationBatch(index);
    }

    if (persistedAllHeads) {
      await this.markHeadCacheWarm(networkId, reconciledHeadSignature);
    }

    return records.length;
  }

  private async currentHeadSignature(
    store: OrbitDBDatabase,
  ): Promise<string | undefined> {
    try {
      return this.headSignature(await store.log?.heads());
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB current head signature unavailable: error=${errorClassName(error)}`,
      );

      return undefined;
    }
  }

  private isPersistedHeadCacheCurrent(
    persistedHeadCache: PersistedHeadCacheHydration,
    currentHeadSignature: string | undefined,
    canCompareHeadSignatures: boolean,
  ): boolean {
    if (!persistedHeadCache.warm || persistedHeadCache.heads === 0) {
      return false;
    }

    if (!canCompareHeadSignatures) {
      return false;
    }

    return (
      currentHeadSignature !== undefined &&
      persistedHeadCache.reconciledHeadSignature === currentHeadSignature
    );
  }

  private async reconcileHeadCache(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
    reconciledHeadSignature: string | undefined,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();

    // The reset empties the cache, so stay not open until a rebuild succeeds.
    this.networksAwaitingHeadReconciliation.add(networkId);

    if (!this.rebuildingHeadsByNetworkId.has(networkId)) {
      this.rebuildingHeadsByNetworkId.set(networkId, new Map());
    }
    let succeeded = false;
    let reconciledHeads: number;

    try {
      await this.resetReplicatedHeadCache(networkId);
      reconciledHeads = await this.hydrateHeadCache(
        networkId,
        stores,
        reconciledHeadSignature,
      );
      succeeded = true;
      this.networksAwaitingHeadReconciliation.delete(networkId);
    } finally {
      this.finishHeadCacheRebuild(networkId, succeeded);
    }
    const elapsedMilliseconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    Kernel.logger.debug?.(
      `OrbitDB replicated head cache reconciled: heads=${reconciledHeads}` +
        ` durationMs=${elapsedMilliseconds.toFixed(3)}`,
    );
  }

  private async resetReplicatedHeadCache(networkId: string): Promise<void> {
    if (this.headCache) {
      await this.headCache.deleteByNetworkId(networkId);
    }

    this.persistedHeadKeysByNetworkId.delete(networkId);
  }

  /** Takes the rebuilt cache over; a failed rebuild keeps what it had and adds what it learned. */
  private finishHeadCacheRebuild(networkId: string, succeeded: boolean): void {
    const rebuilt = this.rebuildingHeadsByNetworkId.get(networkId);

    this.rebuildingHeadsByNetworkId.delete(networkId);

    if (!rebuilt || !this.storesByNetworkId.has(networkId)) return;

    if (succeeded) {
      this.replicatedHeadsByNetworkId.set(networkId, rebuilt);

      return;
    }

    const current = this.replicatedHeads(networkId);

    for (const [key, head] of rebuilt) current.set(key, head);
  }

  private async hydratePersistedHeadCache(
    networkId: string,
  ): Promise<PersistedHeadCacheHydration> {
    if (!this.headCache) {
      return { heads: 0, warm: false };
    }

    try {
      const [heads, reconciledHeadSignature, warm] = await Promise.all([
        this.headCache.findByNetworkId(networkId),
        this.headCache.findReconciledHeadSignature(networkId),
        this.headCache.isWarm(networkId),
      ]);

      for (const head of heads) {
        this.markPersistedHeadKey(networkId, head.key);
        this.markRestoredHead(networkId, head.key);
        const headKey = head.key;
        const value = await this.admitHead(
          head.value,
          this.cachedHeadReadmission(networkId, headKey, true),
        );

        if (value) {
          await this.cacheReadmittedHead(networkId, headKey, value, false);
        }
      }

      if (heads.length > 0) {
        Kernel.logger.debug?.(
          `OrbitDB replicated head cache restored: heads=${heads.length}`,
        );
      }

      return { heads: heads.length, reconciledHeadSignature, warm };
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache restore failed: error=${errorClassName(error)}`,
      );

      return { heads: 0, warm: false };
    }
  }

  private markPersistedHeadKey(networkId: string, key: string): void {
    const keys = this.persistedHeadKeysByNetworkId.get(networkId) ?? new Set();

    keys.add(key);
    this.persistedHeadKeysByNetworkId.set(networkId, keys);
  }

  private hasPersistedHeadKey(networkId: string, key: string): boolean {
    return this.persistedHeadKeysByNetworkId.get(networkId)?.has(key) ?? false;
  }

  private async persistHeadCache(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.headCache) {
      return true;
    }

    try {
      await this.headCache.save(networkId, key, this.cleanDocument(value));

      return true;
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache persistence failed: error=${errorClassName(error)}`,
      );

      return false;
    }
  }

  private async markHeadCacheWarm(
    networkId: string,
    reconciledHeadSignature?: string,
  ): Promise<void> {
    if (!this.headCache) {
      return;
    }

    try {
      await this.headCache.markWarm(networkId, reconciledHeadSignature);
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache warm marker failed: error=${errorClassName(error)}`,
      );
    }
  }

  private withoutUndefined(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.withoutUndefined(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [
          entryKey,
          this.withoutUndefined(entryValue),
        ]),
    );
  }

  private cleanDocument(
    document: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.withoutUndefined(document) as Record<string, unknown>;
  }

  private documentFreshness(document: Record<string, unknown>): number {
    return Math.max(
      ...[
        'deletedAt',
        'editedAt',
        'endedAt',
        'receivedAt',
        'updatedAt',
        'createdAt',
      ]
        .map((attribute) => document[attribute])
        .filter((value): value is number => typeof value === 'number'),
      0,
    );
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private documentVersion(document: Record<string, unknown>): number {
    return this.numberValue(document, 'version') || 0;
  }

  private canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalValue(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, this.canonicalValue(value[key])]),
    );
  }

  private headComparableValue(
    document: Record<string, unknown>,
  ): Record<string, unknown> {
    const value = { ...document };

    if (this.headRecordCollectionNames(value).length > 0) {
      delete value.updatedAt;
    }

    return value;
  }

  private isSameHeadContent(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentCollections = this.headRecordCollectionNames(current);
    const candidateCollections = this.headRecordCollectionNames(candidate);

    if (
      currentCollections.length !== candidateCollections.length ||
      currentCollections.some(
        (collectionName) => !candidateCollections.includes(collectionName),
      )
    ) {
      return false;
    }

    return (
      JSON.stringify(this.canonicalValue(this.headComparableValue(current))) ===
      JSON.stringify(this.canonicalValue(this.headComparableValue(candidate)))
    );
  }

  private isPersistedForAllTargetNetworks(
    key: string,
    networkIds: string[],
    candidate: Record<string, unknown>,
  ): boolean {
    const entries = this.networkStoreEntriesForNetworkIds(networkIds);

    return (
      entries.length > 0 &&
      entries.every(
        ({ networkId }) =>
          this.hasPersistedHeadKey(networkId, key) &&
          this.hasSameCachedHeadContent(
            this.replicatedHeadsByNetworkId.get(networkId)?.get(key),
            candidate,
          ),
      )
    );
  }

  private hasSameCachedHeadContent(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): boolean {
    return current !== undefined && this.isSameHeadContent(current, candidate);
  }

  private shouldSkipHeadWrite(
    key: string,
    networkIds: string[],
    candidate: Record<string, unknown>,
    force: boolean = false,
  ): boolean {
    return (
      !force && this.isPersistedForAllTargetNetworks(key, networkIds, candidate)
    );
  }

  private enqueueHeadWrite(
    key: string,
    write: () => Promise<void>,
  ): Promise<void> {
    const previous = this.headWriteQueues.get(key);
    const next = previous
      ? previous.catch((): void => undefined).then(write)
      : write();
    const removeCompletedWrite = (): void => {
      if (this.headWriteQueues.get(key) === next) {
        this.headWriteQueues.delete(key);
      }
    };

    this.headWriteQueues.set(key, next);
    void next.then(removeCompletedWrite, removeCompletedWrite);

    return next;
  }

  private async targetNetworkIdsForHeadWrite(
    value: Record<string, unknown>,
    networkIds: string[],
  ): Promise<string[]> {
    if (networkIds.length > 0) {
      return networkIds;
    }

    return this.targetNetworkIdsForDocument(value, networkIds);
  }

  private acceptedHeadWriteValue(
    key: string,
    value: Record<string, unknown>,
    current: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const candidate = this.mergeHeadRecord(key, current, value);

    if (!candidate) return undefined;

    return !current ||
      this.isMergeableHeadKey(key) ||
      this.isNewerOrEqualDocument(current, candidate)
      ? candidate
      : undefined;
  }

  private nextHeadWriteValue(
    key: string,
    value: Record<string, unknown>,
    current: Record<string, unknown> | undefined,
    hasSameCachedContent: boolean,
    force: boolean = false,
  ): Record<string, unknown> | undefined {
    const acceptedValue = this.acceptedHeadWriteValue(key, value, current);

    if (force) {
      return acceptedValue ?? current;
    }

    return acceptedValue ?? (hasSameCachedContent ? current : undefined);
  }

  private isNewerOrEqualDocument(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const byProof = PublicMutationRecord.replaces(current, candidate);

    if (byProof !== undefined) return byProof;

    const currentVersion = this.documentVersion(current);
    const candidateVersion = this.documentVersion(candidate);

    if (currentVersion !== candidateVersion) {
      return currentVersion < candidateVersion;
    }

    return this.documentFreshness(current) <= this.documentFreshness(candidate);
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = document[attribute];

    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
  }

  private networkIdsFromDocument(document: Record<string, unknown>): string[] {
    return [
      ...new Set([
        ...this.stringArrayValue(document, 'networkIds'),
        ...(this.stringValue(document, 'networkId')
          ? [this.stringValue(document, 'networkId') as string]
          : []),
      ]),
    ];
  }

  private relatedHeadKey(related: {
    storeName: OrbitDBReplicatedDocumentStoreName;
    value: string;
  }): string | undefined {
    if (related.storeName === 'communityOperations') {
      return `community-operation-index:${related.value}`;
    }

    if (related.storeName === 'conversationOperations') {
      return `conversation-operation-index:${related.value}`;
    }

    if (related.storeName === 'identities') {
      return `identity:${related.value}`;
    }

    return undefined;
  }

  private async networkIdsFromRelatedHead(related: {
    storeName: OrbitDBReplicatedDocumentStoreName;
    value: string;
  }): Promise<string[]> {
    const headKey = this.relatedHeadKey(related);

    if (!headKey) {
      return [];
    }

    const head = await this.findHead(headKey);

    return head ? this.networkIdsFromDocument(head) : [];
  }

  private relatedIdentityIds(document: Record<string, unknown>): string[] {
    const identityIds = [
      this.stringValue(document, 'ownerIdentityId'),
      this.stringValue(document, 'identityId'),
      this.stringValue(document, 'recipientIdentityId'),
      this.stringValue(document, 'inviterIdentityId'),
    ];
    const payload = document.payload;

    if (this.isRecord(payload)) {
      identityIds.push(...this.relatedIdentityIds(payload));
    }

    return [
      ...new Set(
        identityIds.filter(
          (identityId): identityId is string => typeof identityId === 'string',
        ),
      ),
    ];
  }

  private relatedDocumentId(document: Record<string, unknown>):
    | {
        storeName: OrbitDBReplicatedDocumentStoreName;
        value: string;
      }
    | undefined {
    const communityId = this.stringValue(document, 'communityId');

    if (communityId) {
      return { storeName: 'communityOperations', value: communityId };
    }

    const conversationId = this.stringValue(document, 'conversationId');

    if (conversationId) {
      return { storeName: 'conversationOperations', value: conversationId };
    }

    const payload = document.payload;

    if (!this.isRecord(payload)) {
      return undefined;
    }

    return this.relatedDocumentId(payload);
  }

  private async networkIdsFromRelatedIdentityHead(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    for (const identityId of this.relatedIdentityIds(document)) {
      const networkIds = await this.networkIdsFromRelatedHead({
        storeName: 'identities',
        value: identityId,
      });

      if (networkIds.length > 0) {
        return networkIds;
      }
    }

    return [];
  }

  private async networkIdsFromRelatedDocument(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    const related = this.relatedDocumentId(document);

    if (!related) {
      return this.networkIdsFromRelatedIdentityHead(document);
    }

    const relatedNetworkIds = await this.networkIdsFromRelatedHead(related);

    return relatedNetworkIds.length > 0
      ? relatedNetworkIds
      : this.networkIdsFromRelatedIdentityHead(document);
  }

  private async targetNetworkIdsForDocument(
    document: Record<string, unknown>,
    explicitNetworkIds: string[] = [],
  ): Promise<string[]> {
    const directNetworkIds = [
      ...new Set([
        ...explicitNetworkIds,
        ...this.stringArrayValue(document, 'networkIds'),
        ...(this.stringValue(document, 'networkId')
          ? [this.stringValue(document, 'networkId') as string]
          : []),
        ...(this.isRecord(document.payload)
          ? this.stringArrayValue(document.payload, 'networkIds')
          : []),
        ...(this.isRecord(document.payload) &&
        this.stringValue(document.payload, 'networkId')
          ? [this.stringValue(document.payload, 'networkId') as string]
          : []),
      ]),
    ];

    if (directNetworkIds.length > 0) {
      return directNetworkIds;
    }

    return [...new Set(await this.networkIdsFromRelatedDocument(document))];
  }

  private storesForNetworkIds(
    networkIds: string[],
  ): OrbitDBPrivateNetworkStores[] {
    return this.networkStoreEntriesForNetworkIds(networkIds).map(
      ({ stores }) => stores,
    );
  }

  private networkStoreEntriesForNetworkIds(
    networkIds: string[],
  ): Array<{ networkId: string; stores: OrbitDBPrivateNetworkStores }> {
    const stores = new Map<string, OrbitDBPrivateNetworkStores>();

    for (const networkId of networkIds) {
      const networkStores = this.storesByNetworkId.get(networkId);

      if (networkStores) {
        stores.set(networkId, networkStores);
      }
    }

    if (stores.size > 0) {
      return [...stores.entries()].map(([networkId, networkStores]) => ({
        networkId,
        stores: networkStores,
      }));
    }

    if (networkIds.length > 0) {
      return [];
    }

    return [...this.storesByNetworkId.entries()].map(
      ([networkId, networkStores]) => ({
        networkId,
        stores: networkStores,
      }),
    );
  }

  private async findStoredHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    let cached: Record<string, unknown> | undefined;

    for (const [networkId, stores] of this.storesByNetworkId) {
      cached = (await this.cacheStoredHead(networkId, stores, key)) ?? cached;
    }

    // A key waiting on a held copy never reads as a partial head: its admitted
    // part waits in the cache until the held head is admitted.
    if (this.awaitsVerifiedHead(key)) throw new ReplicatedStateNotReadyError();

    return cached;
  }

  /**
   * Admits the head one network stores under `key` and caches its admitted
   * part; undefined when nothing is admitted.
   */
  private async cacheStoredHead(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    const stored = this.recordValue(await stores.heads.get?.(key));

    if (!stored) return undefined;

    const directRecord = await this.admitHead(
      stored,
      this.cachedHeadReadmission(networkId, key),
    );

    if (!directRecord) return undefined;

    if ((await this.admittedHeadKeys([key], directRecord)).length === 0) {
      return undefined;
    }

    return (
      this.cacheReplicatedHead(networkId, key, directRecord) ??
      this.cachedHead(key)
    );
  }

  private registerHeadCacheListeners(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): void {
    if (this.headCacheListenerStores.has(stores.heads)) return;

    this.headCacheListenerStores.add(stores.heads);
    stores.heads.events?.on?.('update', (entry) => {
      void this.cacheHeadUpdate(networkId, entry);
    });
    stores.heads.events?.on?.('join', (_peerId, heads) =>
      this.reconcileStoreAfterHeadExchange(
        stores.heads,
        heads,
        'replicated head cache',
        async (headSignature): Promise<void> =>
          this.reconcileHeadCache(networkId, stores, headSignature),
      ),
    );
  }

  private applyHeadRecordScope(
    prefix: string,
    scope: OrbitDBHeadRecordScope,
  ): void {
    for (const [networkId, heads] of [
      ...this.replicatedHeadsByNetworkId,
      ...this.rebuildingHeadsByNetworkId,
    ]) {
      this.applyHeadRecordScopeToNetwork(networkId, heads, prefix, scope);
    }

    for (const key of this.projectedHeads.keys()) {
      if (key.startsWith(prefix)) {
        this.projectedHeads.delete(key);
        this.exactProjectedHeadKeys.delete(key);
      }
    }
  }

  private applyHeadRecordScopeToNetwork(
    networkId: string,
    heads: Map<string, Record<string, unknown>>,
    prefix: string,
    scope: OrbitDBHeadRecordScope,
  ): void {
    for (const [key, value] of heads) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const scoped = scope(networkId, value);

      if (scoped) heads.set(key, scoped);
      else heads.delete(key);
    }
  }

  private hasPendingHeadUnder(prefix: string, onlyRestored: boolean): boolean {
    for (const [networkId, key] of this.pendingHeads(onlyRestored)) {
      if (!key.startsWith(prefix) || this.isVerifiedHead(networkId, key)) {
        continue;
      }

      if (
        onlyRestored
          ? this.isRestoredHead(networkId, key)
          : this.awaitsVerifiedHead(key)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Every head key held in any network with its network, and those a network
   * dropped for want of room: the keys this node restored always, the others
   * unless `onlyRestored`.
   */
  private *pendingHeads(onlyRestored: boolean): Generator<[string, string]> {
    yield* this.headKeysByNetwork(this.droppedRestoredHeadKeys);

    if (!onlyRestored) yield* this.headKeysByNetwork(this.droppedHeadKeys);

    yield* this.headKeysByNetwork(this.unverifiedHeads);
  }

  private *headKeysByNetwork(
    byNetwork: ReadonlyMap<string, { keys(): Iterable<string> }>,
  ): Generator<[string, string]> {
    for (const [networkId, keys] of byNetwork) {
      for (const key of keys.keys()) yield [networkId, key];
    }
  }

  public registerHeadRecordMerger(
    prefix: string,
    merger: OrbitDBHeadRecordMerger,
    scope?: OrbitDBHeadRecordScope,
    repairPublisher?: OrbitDBHeadRepairPublisher,
  ): void {
    this.headRecordMergers.set(prefix, merger);

    if (scope) {
      this.headRecordScopes.set(prefix, scope);
      this.applyHeadRecordScope(prefix, scope);
    } else this.headRecordScopes.delete(prefix);

    if (repairPublisher) this.headRepairPublishers.set(prefix, repairPublisher);
    else this.headRepairPublishers.delete(prefix);
  }

  public async register(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): Promise<void> {
    this.storesByNetworkId.set(networkId, stores);
    this.networksAwaitingHeadReconciliation.add(networkId);
    for (const store of this.listenedStores(stores)) {
      this.storesAwaitingReplay.add(store);
    }
    this.registerDocumentUpdateListeners(stores);
    this.registerHeadCacheListeners(networkId, stores);

    const currentHeadSignature = stores.heads.log
      ? await this.currentHeadSignature(stores.heads)
      : undefined;

    const persistedHeadCache = this.headCache
      ? await this.hydratePersistedHeadCache(networkId)
      : { heads: 0, warm: false };

    if (
      this.isPersistedHeadCacheCurrent(
        persistedHeadCache,
        currentHeadSignature,
        Boolean(stores.heads.log),
      )
    ) {
      this.networksAwaitingHeadReconciliation.delete(networkId);

      if (currentHeadSignature) {
        this.reconciledStoreHeadSignatures.set(
          stores.heads,
          currentHeadSignature,
        );
      }

      await this.bootstrapDocumentUpdateListeners(stores);

      return;
    }

    await this.reconcileHeadCache(networkId, stores, currentHeadSignature);

    if (currentHeadSignature) {
      this.reconciledStoreHeadSignatures.set(
        stores.heads,
        currentHeadSignature,
      );
    }

    await this.bootstrapDocumentUpdateListeners(stores);
  }

  /** Whether this node replicates state for `networkId`, i.e. hosts it. */
  public hostsNetwork(networkId: string): boolean {
    return this.storesByNetworkId.has(networkId);
  }

  public async unregister(networkId: string): Promise<void> {
    const stores = this.storesByNetworkId.get(networkId);

    this.storesByNetworkId.delete(networkId);
    this.networksAwaitingHeadReconciliation.delete(networkId);
    this.persistedHeadKeysByNetworkId.delete(networkId);
    this.replicatedHeadsByNetworkId.delete(networkId);
    this.rebuildingHeadsByNetworkId.delete(networkId);
    this.unverifiedHeads.delete(networkId);
    this.clearHeadOverflow(networkId);
    this.verifiedHeadKeys.delete(networkId);
    this.restoredHeadKeys.delete(networkId);

    for (const key of this.expiredHeadKeys.keys()) {
      if (key.startsWith(`${networkId}\n`)) this.expiredHeadKeys.delete(key);
    }
    this.projectedHeads.clear();
    this.exactProjectedHeadKeys.clear();

    if (stores) {
      for (const store of this.listenedStores(stores)) {
        this.storesAwaitingReplay.delete(store);
      }
    }
    await stores?.stop();
  }

  public clear(): void {
    this.storesByNetworkId.clear();
    this.networksAwaitingHeadReconciliation.clear();
    this.storesAwaitingReplay.clear();
    this.persistedHeadKeysByNetworkId.clear();
    this.replicatedHeadsByNetworkId.clear();
    this.rebuildingHeadsByNetworkId.clear();
    this.projectedHeads.clear();
    this.exactProjectedHeadKeys.clear();
    this.unverifiedHeads.clear();
    this.overflowedHeadNetworks.clear();
    this.droppedHeadKeys.clear();
    this.droppedRestoredHeadKeys.clear();
    this.restoredHeadKeys.clear();
    this.verifiedHeadKeys.clear();
    this.expiredHeadKeys.clear();
    this.stopHeadRetries();
  }

  public async onDocumentUpdated(
    storeName: OrbitDBReplicatedDocumentStoreName,
    listener: (
      document: Record<string, unknown>,
      scope?: object,
    ) => void | Promise<void>,
    options: {
      includeHistory?: boolean;
      historyObserver?: OrbitDBHistoryReplayObserver;
    } = {},
  ): Promise<void> {
    if (options.includeHistory) this.historyStoreNames.add(storeName);

    if (options.historyObserver) {
      const observers = this.historyObservers.get(storeName) ?? new Set();

      observers.add(options.historyObserver);
      this.historyObservers.set(storeName, observers);
    }
    const listeners = this.documentUpdateListeners.get(storeName) ?? new Set();

    listeners.add(listener);
    this.documentUpdateListeners.set(storeName, listeners);

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }

      this.registerDocumentUpdateListener(storeName, store);

      await this.bootstrapSubscriber(storeName, store, () =>
        this.bootstrapSubscribedDocumentListener(
          storeName,
          store,
          listener,
          options.historyObserver,
        ),
      );
    }
  }

  /** Gates accumulate: a record is admitted only if every gate that governs it accepts. */
  public addMutationGate(gate: OrbitDBMutationGate): void {
    this.mutationGate = this.mutationGate
      ? new CompositeOrbitDBMutationGate([this.mutationGate, gate])
      : gate;
  }

  /**
   * Admits a document exactly as `putDocument` does, without writing it. Used
   * for records that must be verified but must not be replicated.
   */
  public async admitDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
  ): Promise<void> {
    this.assertReady();
    await this.assertAdmitted(storeName, this.cleanDocument(document));
  }

  public async putDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.assertReady();
    const cleanDocument = this.cleanDocument(document);

    await this.assertAdmitted(storeName, cleanDocument);

    const targetNetworkIds = await this.targetNetworkIdsForDocument(
      cleanDocument,
      networkIds,
    );

    await Promise.all(
      this.networkStoreEntriesForNetworkIds(targetNetworkIds).map(
        async ({ stores }) => {
          await this.getStore(stores, storeName)?.put?.(cleanDocument);
        },
      ),
    );
  }

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
    networkIds: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    this.assertReady();

    const results = await Promise.all(
      this.networkStoreEntriesForNetworkIds(networkIds).map(
        async ({ networkId, stores }) => {
          const store = this.getStore(stores, storeName);

          if (!store) {
            return [];
          }

          const matched = store.query
            ? await store.query(matcher)
            : (await this.allRecords(store))
                .map((record) => record.value)
                .filter(matcher);

          const { admitted } = await this.admittedRecords(
            storeName,
            matched.filter((record) =>
              this.isOfStoreNetwork(storeName, record, networkId),
            ),
          );

          return admitted;
        },
      ),
    );

    return results.flat();
  }

  /**
   * Stored documents with no admission check. Only for a mutation policy that
   * must count sibling records of its own collection, which `queryDocuments`
   * would re-enter the gate for.
   */
  public async queryUnadmittedDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
    networkIds: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    this.assertReady();

    const results = await Promise.all(
      this.networkStoreEntriesForNetworkIds(networkIds).map(
        async ({ stores }) => {
          const store = this.getStore(stores, storeName);

          if (!store) return [];

          return store.query
            ? await store.query(matcher)
            : (await this.allRecords(store))
                .map((record) => record.value)
                .filter(matcher);
        },
      ),
    );

    return results.flat();
  }

  /**
   * Whether a read of the document must wait rather than answer "missing".
   * This node holds the document but has not admitted it yet and still may:
   * the gate rejected it, possibly because the authorization it rests on had
   * not loaded yet (right after a restart), and it waits to be offered again.
   * Or the store dropped the record of this very document when its
   * re-admission overflowed and has not been readmitted in full since. A
   * pending record is offered a bounded number of times, but a peer can
   * schedule a new one about the same subject, so the answer lasts as long as
   * a peer keeps doing so: the subject is not scoped to a network (issue
   * #734), and a record any hosted network holds about it counts. An overflow
   * lasts until the store is readmitted, and only for the documents it
   * dropped and remembers (a peer that makes it drop more than it can
   * remember delays no other document). Another store's overflow never counts.
   */
  public isDocumentPendingAdmission(
    storeName: OrbitDBReplicatedDocumentStoreName,
    id: string,
  ): boolean {
    return (
      this.readmissions.isPending(`${storeName}:${id}`) ||
      this.isStoreOverflowed(storeName, id)
    );
  }

  /**
   * Whether a subscriber of the store could not replay its history yet
   * because a block was missing locally (right after a restart), so a read
   * cannot tell "missing" from "not replayed yet". The cause is this node's
   * own block availability, and the answer is bounded in time, so the store
   * cannot be kept in this state for long.
   */
  public isSubscriberBootstrapDeferred(
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): boolean {
    const now = Date.now();

    return [...this.storesByNetworkId.values()].some((stores) => {
      const store = this.getStore(stores, storeName);

      return !!store && this.isBootstrapDeferredAt(store, now);
    });
  }

  /**
   * Whether the replicated state is open to reads: a network is registered,
   * every store has finished the replay its registration started, every
   * network's head cache has been rebuilt, and no store still waits on a
   * subscriber replay that a missing local block deferred. None of these
   * conditions lapses with time, so a store that never replays, or a head
   * cache that never rebuilds, keeps the node not open.
   * A rebuild that a peer join starts and fails keeps the node not open
   * until a later join rebuilds the cache.
   */
  public isOpen(): boolean {
    if (
      this.storesByNetworkId.size === 0 ||
      this.storesAwaitingReplay.size > 0 ||
      this.networksAwaitingHeadReconciliation.size > 0
    )
      return false;

    return ![...this.storesByNetworkId.values()].some((stores) =>
      stores
        .getSynchronizationStores()
        .some(({ database }) =>
          this.deferredSubscriberBootstraps.has(database),
        ),
    );
  }

  /** Whether any network is registered, whether or not its stores have replayed. */
  public hasNetworks(): boolean {
    return this.storesByNetworkId.size > 0;
  }

  public async replicateDocumentInBackground(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.assertReady();
    const cleanDocument = this.cleanDocument(document);

    if ((await this.admitRecord(storeName, cleanDocument)) !== 'accepted') {
      throw new InvalidPublicMutationError();
    }

    const targetNetworkIds = await this.targetNetworkIdsForDocument(
      cleanDocument,
      networkIds,
    );

    void Promise.all(
      this.storesForNetworkIds(targetNetworkIds).map((stores) =>
        this.getStore(stores, storeName)?.put?.(cleanDocument),
      ),
    ).catch((error) => {
      Kernel.logger.warn?.(
        `OrbitDB replicated document refresh failed: store=${storeName}` +
          ` error=${errorClassName(error)}`,
      );
    });
  }

  public findHead(key: string): Promise<Record<string, unknown> | undefined> {
    this.assertReady();

    if (this.awaitsVerifiedHead(key)) {
      return Promise.reject(new ReplicatedStateNotReadyError());
    }

    return Promise.resolve(this.cachedHead(key));
  }

  public async findPersistedHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    this.assertReady();

    return this.findStoredHead(key);
  }

  /**
   * Offers every persisted entry of a head key to its merger again. A merger
   * can refuse a head it cannot judge yet (the genesis of its identity is not
   * verified); once that is known the refused history is merged from the log.
   */
  public async rehydrateHead(key: string): Promise<void> {
    this.assertReady();

    for (const [networkId, { heads }] of this.storesByNetworkId) {
      if (await heads.get?.(key)) {
        await this.hydrateHeadKeyHistory(networkId, heads, key);
      }
    }
  }

  public findCachedHeadsByPrefix(
    prefix: string,
  ): Array<Record<string, unknown>> {
    return [...this.cachedHeadKeys()]
      .filter((key) => key.startsWith(prefix) && !this.awaitsVerifiedHead(key))
      .map((key) => this.cachedHead(key))
      .filter((head): head is Record<string, unknown> => head !== undefined);
  }

  /**
   * Whether a head under the prefix is held in any network, or was dropped
   * for want of room. A peer drives all of it, so it is for observation only:
   * no read of a list may wait on it (see `hasPendingRestoredHeadAdmissions`).
   */
  public hasPendingHeadAdmissions(prefix: string): boolean {
    return this.hasPendingHeadUnder(prefix, false);
  }

  /**
   * Whether a head under the prefix that this node restored from its own head
   * cache at start is held, or was dropped for want of room, and has not been
   * admitted yet: the only state a list read waits on. A head a peer plants
   * under a key this node never had is not one of them, however many it
   * plants, so it never makes a list wait.
   */
  public hasPendingRestoredHeadAdmissions(prefix: string): boolean {
    return this.hasPendingHeadUnder(prefix, true);
  }

  /**
   * The cached head of a key, or nothing while the key is held: a held head's
   * admitted part is not complete, so a write built on it would be partial.
   */
  public findCachedHead(key: string): Record<string, unknown> | undefined {
    if (this.awaitsVerifiedHead(key)) return undefined;

    return this.cachedHead(key);
  }

  public cacheHeadLocally(key: string, value: Record<string, unknown>): void {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);

    for (const headKey of this.headKeyDeriver.cachedKeys(key, cleanValue)) {
      // A local write is this node's own head: every hosted network settles it.
      for (const networkId of this.storesByNetworkId.keys()) {
        this.markVerifiedHead(networkId, headKey);
      }
      this.cacheProjectedHead(headKey, cleanValue);
    }
  }

  public replicateHeadInBackground(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
    force: boolean = false,
  ): void {
    void this.putHead(key, value, networkIds, force).catch((error) => {
      Kernel.logger.warn?.(
        `OrbitDB replicated head refresh failed: error=${errorClassName(error)}`,
      );
    });
  }

  public async putHead(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
    force: boolean = false,
  ): Promise<void> {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const currentValue = this.cachedHead(key);
    const hasSameCachedContent = this.hasSameCachedHeadContent(
      currentValue,
      cleanValue,
    );

    if (!force && hasSameCachedContent) {
      const targetDocument = currentValue ?? cleanValue;
      const skipTargetNetworkIds = await this.targetNetworkIdsForHeadWrite(
        targetDocument,
        networkIds,
      );

      if (
        this.shouldSkipHeadWrite(
          key,
          skipTargetNetworkIds,
          targetDocument,
          force,
        )
      ) {
        return;
      }
    }

    const cachedValue = this.nextHeadWriteValue(
      key,
      cleanValue,
      currentValue,
      hasSameCachedContent,
      force,
    );

    if (!cachedValue) {
      return;
    }

    const projectedHead = this.cacheProjectedHead(key, cachedValue);

    await this.enqueueHeadWrite(key, async () => {
      try {
        const targetNetworkIds = await this.targetNetworkIdsForHeadWrite(
          cachedValue,
          networkIds,
        );

        await Promise.all(
          this.networkStoreEntriesForNetworkIds(targetNetworkIds).map(
            ({ networkId, stores }) =>
              this.persistNetworkHead(networkId, stores, key, cachedValue),
          ),
        );
      } finally {
        this.removeProjectedHead(key, projectedHead);
      }
    });
  }

  public async putHeadExactly(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const projectedHead = this.cacheExactProjectedHead(key, cleanValue);

    await this.enqueueHeadWrite(key, async () => {
      try {
        const targetNetworkIds = await this.targetNetworkIdsForHeadWrite(
          cleanValue,
          networkIds,
        );

        await Promise.all(
          this.networkStoreEntriesForNetworkIds(targetNetworkIds).map(
            ({ networkId, stores }) =>
              this.persistNetworkHead(networkId, stores, key, cleanValue, true),
          ),
        );
      } finally {
        this.removeProjectedHead(key, projectedHead);
      }
    });
  }
}
