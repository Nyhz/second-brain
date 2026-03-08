FROM oven/bun:1.2.5
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] http://apt.postgresql.org/pub/repos/apt bullseye-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY services/worker ./services/worker

RUN bun install
RUN for d in /app/packages/* /app/services/worker; do rm -rf "$d/node_modules"; ln -s /app/node_modules "$d/node_modules"; done

WORKDIR /app
CMD ["bun", "run", "services/worker/src/index.ts"]
