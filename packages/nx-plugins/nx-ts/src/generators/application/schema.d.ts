export interface ApplicationGeneratorSchema {
  name: string;
  directory?: string;
  scope?: string;
  framework?: 'none' | 'fastify';
  docker?: boolean;
  dockerStrategy?: 'pnpm-deploy' | 'nx-prune';
  port?: number;
  tags?: string[];
  skipFormat?: boolean;
}
