export interface SetupDockerGeneratorSchema {
  project: string;
  strategy?: 'pnpm-deploy' | 'nx-prune';
  port?: number;
  skipFormat?: boolean;
}
