export type StateGeneratorSchema =
  | {
      /**
       * Type of backend to use (s3)
       */
      backend: 's3';
      /**
       * Name of the storage bucket
       */
      bucket?: string;
      /**
       * AWS region for S3 backend (required)
       */
      region?: string;
      /**
       * S3 key for state file (optional)
       */
      key?: string;

      project: string;
    }
  | {
      /**
       * Type of backend to use (gcs)
       */
      backend: 'gcs';
      /**
       * Name of the storage bucket
       */
      bucket?: string;
      /**
       * Prefix for GCS backend (optional)
       */
      prefix?: string;

      project: string;
    };
