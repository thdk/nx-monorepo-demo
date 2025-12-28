# bootstra-infra project

Contains infrastructure as code for cloud resources that must be created seperately from the main IaC pipeline.

Usually it is fine to run this manually on your own computer.

```sh
# Login with admin
gcloud auth application-default login
npx nx terraform-apply bootstrap-infra
```

Example can be to:
- add / remove permissions for the role assumed by our ci/cd pipeline
- create artifacts buckets to store build artifacts
- to create new container registries for uploading container images on succesful build of applications

Other projects should always be applied by CI jobs.

To test if the CI job can (a.k.a. has permissions to) apply a given infra project you can impersonate the cicd-user locally:

```sh
gcloud auth application-default login \
    --impersonate-service-account cicd-user@nx-monorepo-demo-462313.iam.gserviceaccount.com
```