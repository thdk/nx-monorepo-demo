# Run the container with `docker run -it --rm --init -p 8082:8082 --env PORT=8082 localhost/app-3:0.0.1`.
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=8080
# Allow to set the service version via build arg
ARG SERVICE_VERSION
ENV SERVICE_VERSION=$SERVICE_VERSION

ARG PNPM_VERSION
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

RUN corepack enable pnpm

WORKDIR /app

# Copy manifests first so pnpm fetch layer is cached when only source changes
COPY ./dist/pnpm-lock.yaml ./dist/pnpm-workspace.yaml ./dist/package.json ./

# Fetch dependencies into cache-mounted pnpm store
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --prod

# Copy full dist output (including workspace_modules with compiled code)
COPY ./dist .

# Install offline from the cached store 
# TODO: temporary need to disable frozen-lockfile due to nx bug https://github.com/nrwl/nx/issues/35425
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --offline --no-frozen-lockfile

CMD [ "node", "main.js" ]
