export interface SetupDockerGeneratorSchema {
  project: string;
  strategy?: 'pnpm-deploy' | 'pnpm-fetch';
  port?: number;
  skipFormat?: boolean;
}
