FROM node:24.14-bullseye as base
ENV NODE_OPTIONS=--max_old_space_size=4096
WORKDIR /var/www/
COPY package.json yarn.lock ./
# COPY .npmrc .

FROM base as build
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
# RUN rm .npmrc
COPY src ./src
COPY var ./var
COPY config ./config
COPY .env .
COPY tsconfig.json .
COPY tsconfig.build.json .
ENV NODE_ENV=build
RUN yarn build

FROM base as final
COPY --from=build /var/www/.env .env
COPY --from=build /var/www/dist ./dist
COPY --from=build /var/www/config ./config
RUN yarn --ignore-engines --frozen-lockfile --production
RUN npm install pm2 -g
ENV NODE_ENV=build
CMD yarn start

FROM base as local
COPY . ./
RUN yarn --ignore-engines
# RUN rm .npmrc
ENV NODE_ENV=local
CMD yarn local

FROM base as tests
RUN yarn --prefer-offline --frozen-lockfile --ignore-engines
COPY . .
ENV NODE_ENV=test
RUN yarn test
