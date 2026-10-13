/**
 * `converged`: the peer announced the same community state digest as ours.
 * `diverged`: it announced a different one.
 * `unknown`: no fresh announcement, or our own digest is not computed yet.
 */
export type NodeNetworkCommunityState = 'converged' | 'diverged' | 'unknown';
