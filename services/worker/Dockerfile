FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY services/worker ./services/worker

RUN bun install
RUN for d in /app/packages/* /app/services/worker; do rm -rf "$d/node_modules"; ln -s /app/node_modules "$d/node_modules"; done

WORKDIR /app
CMD ["bun", "run", "services/worker/src/index.ts"]
