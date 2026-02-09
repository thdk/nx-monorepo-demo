# Run the container with `docker run -it --rm --init -p 8082:8082 --env PORT=8082 localhost/app-2:0.0.1`.
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=8080
# Allow to set the service version via build arg
ARG SERVICE_VERSION
ENV SERVICE_VERSION=$SERVICE_VERSION

WORKDIR /app

COPY ./dist app/

RUN npm --prefix app --omit=dev -f install 

CMD [ "node", "app/main.js" ]


