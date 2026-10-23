# Build with bun (matches bun.lock), run with Node.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/db ./db
COPY --from=build /app/drizzle/migrations ./drizzle/migrations
COPY --from=build /app/database/foundation-seed.sql ./database/foundation-seed.sql
# Apply pending database changes, then start the server (Railway sets PORT).
CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
