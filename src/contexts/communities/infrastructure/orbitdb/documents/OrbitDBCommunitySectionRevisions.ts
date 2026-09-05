/**
 * Monotonic per-section revision counters of a replicated community document.
 *
 * Each section is revised independently so that concurrent changes to
 * independent parts of a community (for example, an accepted member on one
 * node and a profile edit on another) survive OrbitDB replication instead of
 * one full-document snapshot overwriting the other.
 */
export interface OrbitDBCommunitySectionRevisions {
  bans: number;
  channels: number;
  members: number;
  profile: number;
  roles: number;
}
