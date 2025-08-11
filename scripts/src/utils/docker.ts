import { $ } from 'zx';
import { readFileSync } from 'fs';

export interface DockerImageConfig {
  serviceName: string;
  containerRegistryUrl: string;
  imageTarget?: string;
  serviceVersion: string;
  commitShaShort: string;
  repoImage: string;
  imageVariant: string;
  dockerImageShaTag: string;
  dockerImageVersionTag: string;
}

export function validateEnvironment(): {
  serviceName: string;
  containerRegistryUrl: string;
  imageTarget?: string;
} {
  const serviceName =
    process.env.SERVICE_NAME || process.env.NX_TASK_TARGET_PROJECT;
  const containerRegistryUrl = process.env.CONTAINER_REGISTRY_URL;
  const imageTarget = process.env.IMAGE_TARGET;

  if (!serviceName) {
    console.error('SERVICE_NAME is not set.');
    process.exit(1);
  }

  if (!containerRegistryUrl) {
    console.error('CONTAINER_REGISTRY_URL is not set.');
    process.exit(1);
  }

  return { serviceName, containerRegistryUrl, imageTarget };
}

export async function getDockerImageConfig(): Promise<DockerImageConfig> {
  const { serviceName, containerRegistryUrl, imageTarget } =
    validateEnvironment();

  const commitShaShort = (await $`git rev-parse --short=8 HEAD`).stdout.trim();
  const repoImage = `${containerRegistryUrl}/${serviceName}`;

  const imageVariant = imageTarget ? `${imageTarget}_` : '';

  const packageJsonPath = `apps/${serviceName}/package.json`;
  const serviceVersion = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8')
  ).version;

  console.log(`Service version found: ${serviceVersion}`);

  const dockerImageShaTag = `${repoImage}:${imageVariant}${commitShaShort}`;
  const dockerImageVersionTag = `${repoImage}:${imageVariant}${serviceVersion}`;

  return {
    serviceName,
    containerRegistryUrl,
    imageTarget,
    serviceVersion,
    commitShaShort,
    repoImage,
    imageVariant,
    dockerImageShaTag,
    dockerImageVersionTag,
  };
}

export function logDockerOperation(
  operation: string,
  config: DockerImageConfig
): void {
  if (!config.imageTarget) {
    console.log(`${operation} ${config.serviceName} docker image...`);
  } else {
    console.log(
      `${operation} ${config.serviceName} docker image with target ${config.imageTarget}...`
    );
  }
}
