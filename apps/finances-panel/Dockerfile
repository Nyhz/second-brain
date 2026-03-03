FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps/finances-panel ./apps/finances-panel

RUN bun install
RUN for d in /app/packages/* /app/apps/finances-panel; do rm -rf "$d/node_modules"; ln -s /app/node_modules "$d/node_modules"; done

WORKDIR /app/apps/finances-panel
CMD ["bun", "run", "dev"]
