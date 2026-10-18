import { getMetadataArgsStorage } from 'routing-controllers';

import { RegisteredRoute } from './RegisteredRoute';

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPathPattern = (route: string): RegExp => {
  const source = route
    .split(/(:[A-Za-z_][A-Za-z0-9_]*)/)
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : escapeRegExp(segment),
    )
    .join('');

  return new RegExp(`^${source}$`);
};

/**
 * Every route routing-controllers registers, as method and path pattern. Paths
 * are relative to the route prefix, as the controllers declare them.
 */
export const registeredRoutes = (): RegisteredRoute[] => {
  const storage = getMetadataArgsStorage();

  return storage.actions.map((action) => {
    const controller = storage.controllers.find(
      (candidate) => candidate.target === action.target,
    );
    const actionRoute = action.route ?? '';
    const path =
      actionRoute instanceof RegExp
        ? actionRoute
        : toPathPattern(`${controller?.route ?? ''}${actionRoute}`);

    return { method: action.type.toUpperCase(), path };
  });
};
