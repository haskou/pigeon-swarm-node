export type CallIceServerEnvironment = {
  CALLS_ICE_TRANSPORT_POLICY?: string;
  CALLS_STUN_URLS?: string;
  CALLS_TURN_CREDENTIAL?: string;
  CALLS_TURN_CREDENTIAL_TTL_SECONDS?: number | string;
  CALLS_TURN_DISCOVERY_ENABLED?: boolean | string;
  CALLS_TURN_PORT?: number | string;
  CALLS_TURN_PUBLIC_HOST?: string;
  CALLS_TURN_PUBLICATION_INTERVAL_MS?: number | string;
  CALLS_TURN_RECORD_TTL_MS?: number | string;
  CALLS_TURN_SHARED_SECRET?: string;
  CALLS_TURN_TRANSPORTS?: string;
  CALLS_TURN_URLS?: string;
  CALLS_TURN_USERNAME?: string;
  PIGEON_PUBLIC_HOST?: string;
};
