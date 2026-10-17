FROM node:24.22.0-bookworm AS base
ENV NODE_OPTIONS=--max_old_space_size=4096
WORKDIR /var/www/
COPY package.json yarn.lock ./
# postinstall patches dependencies with these scripts
COPY scripts ./scripts
# COPY .npmrc .

FROM base AS build
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
# RUN rm .npmrc
COPY src ./src
COPY config ./config
COPY .env .
COPY tsconfig.json .
COPY tsconfig.build.json .
ENV NODE_ENV=build
RUN yarn build

FROM base AS final
COPY --from=build /var/www/.env .env
COPY --from=build /var/www/dist ./dist
COPY --from=build /var/www/config ./config
# swagger specs are read from src/apps/apis at runtime
COPY --from=build /var/www/src/apps/apis ./src/apps/apis
RUN yarn --ignore-engines --frozen-lockfile --production
# The process writes only under these folders (docs/INSTALLATION.md). They are
# owned by the unprivileged `node` user so the container never needs root, and a
# new named volume mounted on one of them inherits writable ownership.
RUN mkdir -p private_blobs local_storage ipfs_storage logs var/log var/cache \
  && chown -R node:node private_blobs local_storage ipfs_storage logs var \
  && chmod 0700 private_blobs
USER node
ENV NODE_ENV=
CMD yarn start

FROM base AS local
COPY . ./
RUN yarn --ignore-engines
# RUN rm .npmrc
ENV NODE_ENV=local
CMD yarn local

FROM base AS tests
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
COPY . .
ENV NODE_ENV=test
RUN yarn test
