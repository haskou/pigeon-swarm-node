FROM node:24.15-bullseye AS base
ENV NODE_OPTIONS=--max_old_space_size=4096
WORKDIR /var/www/
COPY package.json yarn.lock ./
# COPY .npmrc .

FROM base AS build
COPY scripts ./scripts
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines && rm -rf scripts
# RUN rm .npmrc
COPY src ./src
COPY config ./config
COPY .env .
COPY tsconfig.json .
COPY tsconfig.build.json .
ENV NODE_ENV=build
RUN yarn build

FROM base AS production-dependencies
COPY scripts ./scripts
RUN yarn --ignore-engines --frozen-lockfile --production && rm -rf scripts

FROM base AS final
COPY --from=build /var/www/.env .env
COPY --from=build /var/www/dist ./dist
COPY --from=build /var/www/config ./config
COPY --from=production-dependencies /var/www/node_modules ./node_modules
ENV NODE_ENV=
CMD yarn start

FROM base AS local
COPY . ./
RUN yarn --ignore-engines
# RUN rm .npmrc
ENV NODE_ENV=local
CMD yarn local

FROM base AS tests
COPY scripts ./scripts
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
COPY . .
ENV NODE_ENV=test
RUN yarn test
