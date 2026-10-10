# Imagen de producción de Trivia Party: un único contenedor sirve cliente, API y Socket.IO.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
# DATABASE_URL decide qué esquema de Prisma se genera (SQLite o PostgreSQL).
ARG DATABASE_URL=file:./trivia.db
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=build /app /app
EXPOSE 3001
# Aplica migraciones, importa el banco (idempotente) y arranca.
CMD ["sh", "-c", "cd server && node scripts/prisma.mjs migrate deploy && node dist/cli/import.js data/questions && node dist/index.js"]
