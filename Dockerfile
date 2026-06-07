FROM node:24.15-bullseye AS base
ENV NODE_OPTIONS=--max_old_space_size=4096
WORKDIR /var/www/
COPY package.json yarn.lock ./
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
RUN yarn --ignore-engines --frozen-lockfile --production
ENV NODE_ENV=
EXPOSE 8080 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010
CMD yarn start

FROM base AS local
COPY . ./
RUN yarn --ignore-engines
# RUN rm .npmrc
ENV NODE_ENV=local
EXPOSE 8080 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010
CMD yarn local

FROM base AS tests
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
COPY . .
ENV NODE_ENV=test
RUN yarn test
