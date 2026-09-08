FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm build:server
# The headless server needs collision/checkpoint/AI maps, not artwork or audio.
RUN mkdir -p /maps && cp public/assets/original/manifest.json /maps/ && cp public/assets/original/*-terrain.bin public/assets/original/*-checkpoints.bin public/assets/original/*-racingLine.bin /maps/

FROM nginx:stable-alpine AS client
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM node:24-bookworm-slim AS server
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/server/dist server/dist
COPY --from=build /maps public/assets/original
COPY public/config/game.jsonc public/config/game.jsonc
COPY config/server.jsonc config/server.jsonc
ENV GAME_ROOT=/app DATABASE_PATH=/data/rankings.sqlite
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 2567
CMD ["node", "server/dist/index.js"]

FROM server AS combined
COPY --from=build /app/dist dist
ENV SERVE_CLIENT=1
