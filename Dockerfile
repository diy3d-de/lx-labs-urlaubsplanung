FROM node:20-bookworm

WORKDIR /app

# Build-Tools für native Module (better-sqlite3), falls kein passendes Prebuild existiert
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/dev.db"
ENV SQLITE_PATH=/app/data/dev.db

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
