#!/usr/bin/env node

import { $ } from 'zx';
import { exec } from '../src/utils/exec';
import { getDockerImageConfig, logDockerOperation } from '../src/utils/docker';

const program = async () => {
  $.verbose = true;

  const config = await getDockerImageConfig();

  logDockerOperation('Building', config);

  await $`docker build \
  --file apps/${config.serviceName}/Dockerfile \
  --platform linux/arm64 \
  --build-arg SERVICE_VERSION=${config.serviceVersion} \
  --tag ${config.dockerImageShaTag} \
  --tag ${config.dockerImageVersionTag} \
  --progress=plain ./`;

  console.log(`Docker image built successfully: ${config.dockerImageVersionTag}`);
};

exec('docker-build', program);
