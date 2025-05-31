export type ProjectGeneratorSchema = {
  name: string;
  backend?: 's3' | 'gcs' | 'none';
  terraformStateBucketName: string;
  terraformStateBucketRegion?: string;
  directory: string;
  configurations?: string[];
  aws?: boolean;
  google?: boolean;
  awsProviderVersion: string;
  googleProviderVersion: string;
};

export function isS3Backend(
  schema: ProjectGeneratorSchema
): schema is Extract<ProjectGeneratorSchema, { backend: 's3' }> {
  return schema.backend === 's3';
}

export function isGCSBackend(
  schema: ProjectGeneratorSchema
): schema is Extract<ProjectGeneratorSchema, { backend: 'gcs' }> {
  return schema.backend === 'gcs';
}
