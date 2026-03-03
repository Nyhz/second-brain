FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY apps/portal ./apps/portal

RUN bun install
RUN rm -rf /app/apps/portal/node_modules && ln -s /app/node_modules /app/apps/portal/node_modules

WORKDIR /app/apps/portal
CMD ["bun", "run", "dev"]
