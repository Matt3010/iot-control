FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js svelte.config.js tsconfig.json index.html ./
COPY src ./src
COPY server ./server
# il contratto con gli agenti: lo importano sia il server che il web, quindi
# senza di lui non compila ne l'uno ne l'altro
COPY shared ./shared
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
# I modelli che l'installer di una casa scarica da qui: compose e install.sh.
COPY connector/deploy ./connector/deploy
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
