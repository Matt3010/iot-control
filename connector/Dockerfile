# Il contesto di build è la radice del repo: il connettore ha bisogno di
# shared/protocol.d.ts, che è il contratto e vive fuori da qui.
FROM node:22-alpine AS build
WORKDIR /app/connector
COPY connector/package.json connector/package-lock.json ./
RUN npm ci
COPY shared /app/shared
COPY connector/tsconfig.json ./
COPY connector/src ./src
RUN npm run build

FROM node:22-alpine
# Il numero di versione lo passa chi costruisce, e viene dal tag di rilascio.
ARG VERSION=dev
ENV CONNECTOR_VERSION=$VERSION
ENV NODE_ENV=production
ENV STATE_DIR=/data
WORKDIR /app
COPY connector/package.json connector/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/connector/dist ./dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
CMD ["node", "dist/index.js"]
