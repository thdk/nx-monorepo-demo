# Run the container with `docker run -it --rm --init -p 3000:3000 localhost/app-1:0.0.1`.
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000

# Allow to set the service version via build arg
ARG SERVICE_VERSION
ENV SERVICE_VERSION=$SERVICE_VERSION

WORKDIR /app

COPY ./dist app/

# You can remove this install step if you build with `--bundle` option.
# The bundled output will include external dependencies.
# Currently, we can't install dependencies since esbuild executor no longer generates package.json for the output.
# See: https://github.com/nrwl/nx/issues/30146
# RUN npm --prefix app --omit=dev -f install 

CMD [ "node", "app/main.js" ]


