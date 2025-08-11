#!/usr/bin/env node

import { $ } from 'zx';
import { exec } from '../src/utils/exec';
import { getDockerImageConfig, logDockerOperation } from '../src/utils/docker';

const program = async () => {
  $.verbose = true;

  const config = await getDockerImageConfig();

  logDockerOperation('Pushing', config);

  // Push both SHA and version tagged images
  await $`docker push ${config.dockerImageShaTag}`;
  await $`docker push ${config.dockerImageVersionTag}`;

  console.log(`Docker image pushed successfully: ${config.dockerImageVersionTag}`);
  console.log(`Docker image pushed successfully: ${config.dockerImageShaTag}`);
};

exec('docker-push', program);