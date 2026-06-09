export type ConfigurationGeneratorSchema = {
  name: string;
  project: string;
  backend?: 's3' | 'gcs' | 'none';
};
