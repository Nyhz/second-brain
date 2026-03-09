FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api

RUN rm -rf /app/packages/ui
RUN bun install
RUN for d in /app/packages/* /app/services/api; do rm -rf "$d/node_modules"; ln -s /app/node_modules "$d/node_modules"; done

WORKDIR /app
CMD ["bun", "run", "services/api/src/index.ts"]
