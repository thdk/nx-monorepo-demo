# Built by the @thdk/nx-pnpm-deploy plugin: docker:build depends on `prune`,
# which runs `pnpm --filter=@thdk/app-2 --prod deploy ./out`. That output
# directory is self-contained — package.json, dist/, and a pnpm-resolved
# node_modules/ with every transitive dep — so the runtime image is just a
# COPY + CMD with no install step.
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=8080
ARG SERVICE_VERSION
ENV SERVICE_VERSION=$SERVICE_VERSION

WORKDIR /app

COPY ./out /app

CMD [ "node", "dist/main.js" ]
