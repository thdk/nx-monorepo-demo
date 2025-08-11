#!/usr/bin/env node

import { $ } from 'zx';
import { exec } from '../src/utils/exec';
import { getDockerImageConfig, logDockerOperation } from '../src/utils/docker';

const program = async () => {
  $.verbose = true;

  const config = await getDockerImageConfig();
  const platform = process.env.DOCKER_PLATFORM || 'linux/amd64';

  logDockerOperation('Building', config);

  await $`docker build \
  --file apps/${config.serviceName}/Dockerfile \
  --platform ${platform} \
  --build-arg SERVICE_VERSION=${config.serviceVersion} \
  --tag ${config.dockerImageShaTag} \
  --tag ${config.dockerImageVersionTag} \
  --progress=plain ./`;

  console.log(`Docker image built successfully: ${config.dockerImageVersionTag}`);
};

exec('docker-build', program);
