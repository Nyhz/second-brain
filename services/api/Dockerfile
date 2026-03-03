FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api

RUN bun install

WORKDIR /app/services/api
CMD ["bun", "run", "start"]
