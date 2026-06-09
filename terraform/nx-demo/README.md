# Demo IaC (`scope:nx-demo`)

Terraform projects that deploy the demo apps to GCP. Everything in this scope shares a single GCP project (`nx-monorepo-demo-462313`); a future scope bringing its own GCP project would live as a sibling at `terraform/<new-scope>/`.

State is kept in a GCS bucket (`edissa-tf-state`). Locally you need to be authenticated; CI uses Workload Identity Federation.

## Projects

| Project          | Description                                                                                                | Configurations            |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| `bootstrap-infra`| Enables GCP services, creates Artifact Registry, sets up IAM. [Details](./bootstrap-infra/README.md)       | `development`, `production` |
| `domain-a-infra` | Deploys `app-1` and `app-2` to Cloud Run. Reads image versions from `nx release` git tags.                 | `development`, `production` |
| `domain-b-infra` | Deploys `node-nest-webpack` to Cloud Run. Same pattern as `domain-a-infra`.                                | `development`, `production` |

Domain projects have implicit dependencies on `bootstrap-infra` and the apps they deploy.

## Reusable modules

| Module                       | Purpose                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `modules/cloud-run-service`  | Cloud Run v2 service wrapper — scaling, resource limits, env vars, public-access flag.                        |
| `modules/data-git-tag`       | Custom data source that resolves the latest git tag matching a pattern (e.g. `app-1@*`). Bridges `nx release` tags into Terraform-managed deployments. |

## Local auth

```sh
gcloud auth login
gcloud auth application-default login

# docker registry auth (pick one)
gcloud auth configure-docker                                                       # docker
gcloud auth print-access-token | docker login -u oauth2accesstoken \
  --password-stdin https://europe-west1-docker.pkg.dev                             # podman aliased as docker
```

## Common commands

```sh
# init is a dependency of other targets; usually no need to call it explicitly
pnpm exec nx run-many --target terraform-init

pnpm exec nx run-many --target terraform-plan

# uses --auto-approve — inspect terraform-plan output first.
# TODO: make this interactive so each project can be confirmed individually.
pnpm exec nx run-many --target terraform-apply
```

## Generating new projects

Default generator settings live in `nx.json` under `generators.@thdk/nx-terraform.project`.

```sh
pnpm exec nx generate @thdk/nx-terraform:project domain-c-infra
```
