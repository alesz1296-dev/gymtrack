FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node database ./database
RUN mkdir -p storage && chown node:node storage

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
