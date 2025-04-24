#!/usr/bin/env node

import { $ } from 'zx';
import { readFileSync } from 'fs';
import { exec } from '../src/utils/exec';

const program = async () => {
  $.verbose = true;

  const SERVICE_NAME = process.env.SERVICE_NAME;
  const CONTAINER_REGISTRY_URL = process.env.CONTAINER_REGISTRY_URL;
  const IMAGE_TARGET = process.env.IMAGE_TARGET;

  if (!SERVICE_NAME) {
    console.error('SERVICE_NAME is not set.');
    process.exit(1);
  }

  if (!CONTAINER_REGISTRY_URL) {
    console.error('CONTAINER_REGISTRY_URL is not set.');
    process.exit(1);
  }

  const COMMIT_SHA_SHORT = (
    await $`git rev-parse --short=8 HEAD`
  ).stdout.trim();
  const REPO_IMAGE = `${CONTAINER_REGISTRY_URL}/${SERVICE_NAME}`;

  // Enables building multiple Docker images for a single service, differentiated by target.
  // The image tag is prefixed with the target name to distinguish variants.
  const IMAGE_VARIANT = IMAGE_TARGET ? `${IMAGE_TARGET}_` : '';

  // Read the service version from package.json
  const packageJsonPath = `apps/${SERVICE_NAME}/package.json`;
  const SERVICE_VERSION = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8')
  ).version;
  console.log(`Service version found: ${SERVICE_VERSION}`);

  const DOCKER_IMAGE_SHA_TAG = `${REPO_IMAGE}:${IMAGE_VARIANT}${COMMIT_SHA_SHORT}`;
  const DOCKER_IMAGE_VERSION_TAG = `${REPO_IMAGE}:${IMAGE_VARIANT}${SERVICE_VERSION}`;

  if (!IMAGE_TARGET) {
    console.log(`Building ${SERVICE_NAME} docker image...`);
  } else {
    console.log(
      `Building ${SERVICE_NAME} docker image with target ${IMAGE_TARGET}...`
    );
  }

  await $`docker build \
  --file apps/${SERVICE_NAME}/Dockerfile \
  --platform linux/arm64 \
  --build-arg SERVICE_VERSION=${SERVICE_VERSION} \
  --tag ${DOCKER_IMAGE_SHA_TAG} \
  --tag ${DOCKER_IMAGE_VERSION_TAG} \
  --progress=plain ./`;

  console.log(`Docker image built successfully: ${DOCKER_IMAGE_VERSION_TAG}`);
};

exec('docker-build', program);
