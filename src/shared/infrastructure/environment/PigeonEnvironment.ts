import { Kernel, KernelEnvironment } from '@haskou/ddd-kernel';

export const pigeonEnvironmentSchema = {
  API_PORT: { defaultValue: 8080, type: 'number' },
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
  CONTENT_REPLICATION_QUOTA_BYTES: {
    defaultValue: 1024 ** 3,
    type: 'number',
  },
  DEBUG_NETWORK: { defaultValue: false, type: 'boolean' },
  IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  IDENTITY_ADMISSION_DIFFICULTY_BITS: { defaultValue: 16, type: 'number' },
  IPFS_CONTENT_TIMEOUT_MS: { type: 'number' },
  IPFS_STORAGE_PATH: { defaultValue: './ipfs_storage', type: 'string' },
  LINK_PREVIEW_RATE_LIMIT_PER_MINUTE: {
    defaultValue: 30,
    type: 'number',
  },
  LOG_LEVEL: { type: 'string' },
  LOG_URL: { defaultValue: 'logs', type: 'string' },
  MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE: { defaultValue: 30, type: 'number' },
  MAILBOX_MAX_BYTES: { defaultValue: 8 * 1024 * 1024, type: 'number' },
  MAILBOX_MAX_COUNT: { defaultValue: 10_000, type: 'number' },
  MAILBOX_MAX_ENVELOPES: { defaultValue: 1000, type: 'number' },
  MAILBOX_RETENTION_MS: {
    defaultValue: 14 * 24 * 60 * 60 * 1000,
    type: 'number',
  },
  NODE_ENV: { defaultValue: 'local', type: 'string' },
  NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY: {
    defaultValue: 10_000,
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
  PIGEON_RELAY_RECORD_TTL_SECONDS: {
    defaultValue: 2 * 60 * 60,
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
  PRIVATE_BLOB_RETENTION_MS: {
    defaultValue: 7 * 24 * 60 * 60 * 1000,
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
  SERVICE_NAME: { type: 'string' },
  TRANSPORT_DSN: { defaultValue: 'in-memory', type: 'string' },
} as const;

export type PigeonEnvironment = KernelEnvironment<
  typeof pigeonEnvironmentSchema
>;

function parseEnvironmentValue(
  rawValue: string | undefined,
  definition: (typeof pigeonEnvironmentSchema)[keyof typeof pigeonEnvironmentSchema],
): boolean | number | string | undefined {
  if (rawValue === undefined) {
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

function fallbackEnvironment(): PigeonEnvironment {
  return Object.fromEntries(
    Object.entries(pigeonEnvironmentSchema).map(([key, definition]) => [
      key,
      parseEnvironmentValue(process.env[key], definition),
    ]),
  ) as PigeonEnvironment;
}

function environmentOverrides(): Partial<PigeonEnvironment> {
  return Object.fromEntries(
    Object.entries(pigeonEnvironmentSchema)
      .filter(([key]) => process.env[key] !== undefined)
      .map(([key, definition]) => [
        key,
        parseEnvironmentValue(process.env[key], definition),
      ]),
  ) as Partial<PigeonEnvironment>;
}

export function pigeonEnvironment(): PigeonEnvironment {
  if (process.env.JEST_WORKER_ID) {
    return fallbackEnvironment();
  }

  try {
    return {
      ...fallbackEnvironment(),
      ...Object.fromEntries(
        Object.entries(Kernel.active.environment).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      ...environmentOverrides(),
    } as PigeonEnvironment;
  } catch {
    return fallbackEnvironment();
  }
}
