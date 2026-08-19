FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations

EXPOSE 8080
# Keep the heap well inside the 256MB container limit, leaving headroom
# for Node's own overhead (thread stacks, buffers, the pg driver, etc).
ENV NODE_OPTIONS="--max-old-space-size=176"

CMD ["node", "dist/index.js"]
