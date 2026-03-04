FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps/portal ./apps/portal

RUN bun install
RUN for d in /app/packages/* /app/apps/portal; do rm -rf "$d/node_modules"; ln -s /app/node_modules "$d/node_modules"; done

WORKDIR /app/apps/portal
CMD ["bun", "run", "dev"]
