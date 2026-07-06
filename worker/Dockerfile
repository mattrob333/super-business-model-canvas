FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# The Claude CLI refuses bypassPermissions as root ("--dangerously-skip-
# permissions cannot be used with root/sudo privileges") — every agent run
# died with exit code 1 while the container ran as root (live incident
# 2026-07-06). Run as the stock non-root `node` user; HOME must be writable
# for the CLI's config directory.
USER node
ENV HOME=/home/node
CMD ["node", "dist/index.js"]
