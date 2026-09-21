FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js index.html ./
COPY src ./src
COPY server ./server
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
