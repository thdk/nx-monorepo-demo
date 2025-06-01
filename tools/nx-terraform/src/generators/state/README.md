# Terraform Backend Generator

This Nx generator creates a `backend.tf` file for Terraform, supporting AWS S3 and Google Cloud Storage (GCS) backends.

## Options

- `backend` (required): Type of backend to use (`s3` or `gcs`).
- `bucket` (required): Name of the storage bucket.
- `region` (required for s3): AWS region for S3 backend.
- `key` (optional, s3 only): S3 key for state file.
- `prefix` (optional, gcs only): Prefix for GCS backend.

## Usage

```
npx nx generate @thdk/nx-terraform:state --backend=s3 --bucket=my-tf-bucket --region=us-west-2 --key=my/key/path
```

```
npx nx generate @thdk/nx-terraform:state --backend=gcs --bucket=my-tf-bucket --prefix=terraform/state
```
