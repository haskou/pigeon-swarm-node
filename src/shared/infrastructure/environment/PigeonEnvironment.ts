import { MAX_DEVICE_CREDENTIALS } from '@app/contexts/identity-devices/domain/DeviceCredentialLimits';
import { Kernel, KernelEnvironment } from '@haskou/ddd-kernel';

const MAILBOX_RETENTION_DEFAULT_MS = 14 * 24 * 60 * 60 * 1000;
// setTimeout fires immediately for longer delays, so the bound must stay here.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const pigeonEnvironmentSchema = {
  API_PORT: { defaultValue: 8080, type: 'number' },
  API_TRUST_PROXY: { defaultValue: 'false', type: 'string' },
  CALLS_ICE_TRANSPORT_POLICY: { type: 'string' },
  CALLS_MAX_DURATION_MS: { defaultValue: 43_200_000, type: 'number' },
  CALLS_RECORD_RATE_LIMIT_PER_MINUTE: { defaultValue: 30, type: 'number' },
  CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 120,
    type: 'number',
  },
  CALLS_STUN_URLS: { type: 'string' },
  CALLS_TURN_CREDENTIAL: { type: 'string' },
  CALLS_TURN_CREDENTIAL_TTL_SECONDS: {
    defaultValue: 3600,
    type: 'number',
  },
  CALLS_TURN_DISCOVERY_ENABLED: { defaultValue: true, type: 'boolean' },
  CALLS_TURN_PUBLICATION_INTERVAL_MS: { type: 'number' },
  CALLS_TURN_RECORD_TTL_MS: { type: 'number' },
  CALLS_TURN_SHARED_SECRET: { type: 'string' },
  CALLS_TURN_TRANSPORTS: { type: 'string' },
  CALLS_TURN_URLS: { type: 'string' },
  CALLS_TURN_USERNAME: { type: 'string' },
  CONTAINER_BUILD: { defaultValue: false, type: 'boolean' },
  CONTENT_REPLICATION_MAX_RECORDS_PER_IDENTITY: {
    defaultValue: 10_000,
    type: 'number',
  },
  CONTENT_REPLICATION_NETWORK_BUDGET_BYTES: {
    defaultValue: 32 * 1024 ** 3,
    type: 'number',
  },
  CONTENT_REPLICATION_QUOTA_BYTES: {
    defaultValue: 1024 ** 3,
    type: 'number',
  },
  IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 0,
    type: 'number',
  },
  IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  IPFS_CONTENT_TIMEOUT_MS: { type: 'number' },
  IPFS_STORAGE_PATH: { defaultValue: './ipfs_storage', type: 'string' },
  LINK_PREVIEW_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  LOG_LEVEL: { type: 'string' },
  LOG_URL: { defaultValue: 'logs', type: 'string' },
  MAILBOX_APPEND_RATE_PER_MINUTE: { defaultValue: 120, type: 'number' },
  MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE: { defaultValue: 30, type: 'number' },
  MAILBOX_MAX_BYTES: { defaultValue: 8 * 1024 * 1024, type: 'number' },
  MAILBOX_MAX_COUNT: { defaultValue: 10_000, type: 'number' },
  MAILBOX_MAX_ENVELOPES: { defaultValue: 1000, type: 'number' },
  // The root reader plus one per device an identity may hold.
  MAILBOX_MAX_READERS: {
    defaultValue: MAX_DEVICE_CREDENTIALS + 1,
    type: 'number',
  },
  MAILBOX_RETENTION_MS: {
    defaultValue: MAILBOX_RETENTION_DEFAULT_MS,
    type: 'number',
  },
  NODE_BLOCK_LIST_BODY_TIMEOUT_MS: { defaultValue: 120_000, type: 'number' },
  NODE_BLOCK_LIST_MAX_BYTES: { defaultValue: 64 * 1024 * 1024, type: 'number' },
  NODE_BLOCK_SOURCE_FETCH_INTERVAL_MS: {
    defaultValue: 60 * 60 * 1000,
    type: 'number',
  },
  NODE_BLOCK_SOURCE_FETCH_TIMEOUT_MS: {
    defaultValue: 60 * 1000,
    type: 'number',
  },
  NODE_ENV: { defaultValue: 'local', type: 'string' },
  NODE_INITIALIZER_TIMEOUT_MS: { defaultValue: 10 * 60 * 1000, type: 'number' },
  NODE_REGISTRATION_CODE_MAX_TTL_DAYS: { defaultValue: 30, type: 'number' },
  NODE_REGISTRATION_CODE_MAX_USES: { defaultValue: 100, type: 'number' },
  NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY: {
    defaultValue: 10_000,
    type: 'number',
  },
  NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR: {
    defaultValue: 4,
    type: 'number',
  },
  NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT: {
    defaultValue: 100,
    type: 'number',
  },
  NOTIFICATIONS_MAX_STATES_PER_IDENTITY: {
    defaultValue: 30_000,
    type: 'number',
  },
  NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS: { type: 'number' },
  PIGEON_LOCAL_DB_PATH: { type: 'string' },
  PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS: { type: 'number' },
  PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS: { type: 'number' },
  PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS: { type: 'number' },
  PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS: {
    defaultValue: 60 * 60,
    type: 'number',
  },
  PIGEON_PUBLIC_BOOTSTRAP_ENABLED: { defaultValue: true, type: 'boolean' },
  PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS: { type: 'string' },
  PIGEON_PUBLIC_RELAY_RECORDS_PATH: { type: 'string' },
  PIGEON_RELAY_DATA_LIMIT_BYTES: {
    defaultValue: 64 * 1024 * 1024,
    type: 'number',
  },
  PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS: { type: 'number' },
  PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS: { type: 'number' },
  PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS: {
    defaultValue: 60 * 1000,
    type: 'number',
  },
  PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS: { type: 'number' },
  PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS: { type: 'number' },
  PIGEON_RELAY_RECORD_TTL_MS: {
    defaultValue: 2 * 60 * 60 * 1000,
    type: 'number',
  },
  PIGEON_STORED_RELAY_FALLBACK_MS: {
    defaultValue: 7 * 24 * 60 * 60 * 1000,
    type: 'number',
  },
  PIGEON_TURN_RUNTIME_CONFIG_PATH: {
    defaultValue: './var/cache/calls-turn-runtime.conf',
    type: 'string',
  },
  PRIVATE_BLOB_MAX_BYTES: { defaultValue: 50 * 1024 * 1024, type: 'number' },
  PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER: {
    defaultValue: 500 * 1024 * 1024,
    type: 'number',
  },
  PRIVATE_BLOB_QUOTA_BYTES_TOTAL: {
    defaultValue: 10 * 1024 * 1024 * 1024,
    type: 'number',
  },
  // Effective value is never below MAILBOX_RETENTION_MS; see PrivateBlobPolicy.
  PRIVATE_BLOB_RETENTION_MS: {
    defaultValue: MAILBOX_RETENTION_DEFAULT_MS,
    type: 'number',
  },
  PRIVATE_BLOB_STORAGE_PATH: {
    defaultValue: './private_blobs',
    type: 'string',
  },
  PRIVATE_BLOB_UPLOAD_WINDOW_MS: {
    defaultValue: 60 * 60 * 1000,
    type: 'number',
  },
  PUBSUB_TOPIC_PREFIX: { defaultValue: 'pigeon-swarm', type: 'string' },
  PUSH_VAPID_PRIVATE_KEY: { type: 'string' },
  PUSH_VAPID_PUBLIC_KEY: { type: 'string' },
  PUSH_VAPID_SUBJECT: {
    defaultValue: 'mailto:admin@localhost',
    type: 'string',
  },
  REALTIME_ALLOWED_ORIGINS: { defaultValue: '', type: 'string' },
  ROUTE_PREFIX: { type: 'string' },
  SERVED_SLOTS_PER_SOURCE: { defaultValue: 2_500, type: 'number' },
  SERVICE_NAME: { type: 'string' },
  TRANSPORT_DSN: { defaultValue: 'in-memory', type: 'string' },
} as const;

export type PigeonEnvironment = KernelEnvironment<
  typeof pigeonEnvironmentSchema
>;

// Integer bounds enforced on top of the kernel schema, which only checks that
// numbers are finite. Kept beside the schema so the bounds sit with the names.
export const pigeonEnvironmentIntegerRanges = {
  NODE_INITIALIZER_TIMEOUT_MS: { max: MAX_TIMER_DELAY_MS, min: 1 },
  SERVED_SLOTS_PER_SOURCE: { max: 10_000, min: 1 },
} as const;

// Blank is unset only for integer variables (type 'number').
function isUnset(
  rawValue: string | undefined,
  definition: (typeof pigeonEnvironmentSchema)[keyof typeof pigeonEnvironmentSchema],
): boolean {
  return (
    rawValue === undefined ||
    (definition.type === 'number' && rawValue.trim() === '')
  );
}

function parseEnvironmentValue(
  rawValue: string | undefined,
  definition: (typeof pigeonEnvironmentSchema)[keyof typeof pigeonEnvironmentSchema],
): boolean | number | string | undefined {
  // Only integers treat a blank value as unset: a blank integer would otherwise
  // become 0. A blank boolean or string keeps the value it parsed to before.
  if (isUnset(rawValue, definition)) {
    return 'defaultValue' in definition ? definition.defaultValue : undefined;
  }

  if (definition.type === 'boolean') {
    return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
  }

  if (definition.type === 'number') {
    return Number(rawValue);
  }

  return rawValue;
}

/**
 * Rejects values outside the integer bounds, naming the variable. Applied to
 * both the process environment and the kernel-loaded environment.
 */
export function validatePigeonEnvironment(
  environment: Partial<Record<string, unknown>>,
): void {
  for (const [name, range] of Object.entries(pigeonEnvironmentIntegerRanges)) {
    const value = environment[name];

    if (
      value !== undefined &&
      !(
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= range.min &&
        value <= range.max
      )
    ) {
      throw new Error(
        `Environment variable "${name}" must be an integer from ${range.min} to ${range.max}.`,
      );
    }
  }
}

function fallbackEnvironment(): PigeonEnvironment {
  const environment = Object.fromEntries(
    Object.entries(pigeonEnvironmentSchema).map(([key, definition]) => [
      key,
      parseEnvironmentValue(process.env[key], definition),
    ]),
  ) as PigeonEnvironment;
  validatePigeonEnvironment(environment);

  return environment;
}

function environmentOverrides(): Partial<PigeonEnvironment> {
  return Object.fromEntries(
    Object.entries(pigeonEnvironmentSchema)
      .filter(([key, definition]) => !isUnset(process.env[key], definition))
      .map(([key, definition]) => [
        key,
        parseEnvironmentValue(process.env[key], definition),
      ]),
  ) as Partial<PigeonEnvironment>;
}

// A merged value out of range never reaches the caller: it falls back to the
// process environment, which is validated too.
export function pigeonEnvironment(): PigeonEnvironment {
  if (process.env.JEST_WORKER_ID) {
    return fallbackEnvironment();
  }

  try {
    const environment = {
      ...fallbackEnvironment(),
      ...Object.fromEntries(
        Object.entries(Kernel.active.environment).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      ...environmentOverrides(),
    } as PigeonEnvironment;

    validatePigeonEnvironment(environment);

    return environment;
  } catch {
    return fallbackEnvironment();
  }
}
