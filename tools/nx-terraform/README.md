# nx-terraform

## Plugin

### Installation

Add an entry to the `plugins` section of `nx.json`.

```json
{ "plugin": "@thdk/nx-terraform/plugin" }
```

### Conventions

#### var files

A project must have a `vars` folder with at least one file `{configuration}.tfvars.tf`. The project may have multiple var files for which the
plugin will infer an nx configuration for each of these.

#### backend configuration

A project must have a `backend` folder with a file for each nx configuration: `{configuration}.tfbackend`.

### Options

### Inferred targets

This plugin will, once added to your Nx workspace infer the following targets for all projects that contain a `main.tf` file.

#### terraform-init

#### terraform-format

#### terraform-format:check

#### terraform-validate

#### terraform-plan

#### terraform-show

#### terraform-apply

## Generator

### `project` Generator

The `project` generator scaffolds a new Terraform project in your Nx workspace, adhering to the conventions enforced by the nx-terraform plugin (see above).

#### Usage

```sh
npx nx generate @thdk/nx-terraform:project <name> \
  --terraformStateBucketName=<bucket-name> \
  --terraformStateBucketRegion=<region> \
  [--directory=<directory>] \
  [--environments=<env1,env2,...>] \
  [--aws] \
  [--google]
```

#### Options

| Option                       | Type     | Required | Description                                                                            |
| ---------------------------- | -------- | -------- | -------------------------------------------------------------------------------------- |
| `name`                       | string   | Yes      | Name of the new project. Must use only letters, numbers, dashes, or underscores.       |
| `terraformStateBucketName`   | string   | Yes      | Name of the S3 bucket to store the Terraform state.                                    |
| `terraformStateBucketRegion` | string   | Yes      | AWS region of the S3 bucket for the Terraform state.                                   |
| `directory`                  | string   | No       | Directory to create the project in. Defaults to `terraform/<name>`.                    |
| `environments`               | string[] | No       | Comma-separated list of environment names. Generates a project configuration for each. |
| `aws`                        | boolean  | No       | Include AWS provider block in generated Terraform files.                               |
| `google`                     | boolean  | No       | Include Google provider block in generated Terraform files.                            |

#### Example

```sh
npx nx generate @thdk/nx-terraform:project my-infra \
  --terraformStateBucketName=my-bucket \
  --terraformStateBucketRegion=eu-west-1 \
  --directory=infra/my-infra \
  --environments=development,production \
  --aws \
  --google
```
