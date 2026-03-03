FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY services/worker ./services/worker

RUN bun install

WORKDIR /app/services/worker
CMD ["bun", "run", "start"]
