FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps/finances-panel ./apps/finances-panel

RUN bun install

WORKDIR /app/apps/finances-panel
CMD ["bun", "run", "dev"]
