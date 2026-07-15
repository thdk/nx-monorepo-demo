# nx-terraform

## Plugin

### Installation

Add an entry to the `plugins` section of `nx.json`.

```json
{ "plugin": "@thdk/nx-terraform/plugin" }
```

### Layouts

The plugin supports the two common ways of laying out Terraform environments. In both, every environment becomes an **Nx configuration** on the inferred targets, so `nx run my-infra:terraform-apply:production` means the same thing regardless of layout. The layout is detected per project, so both can coexist in one workspace.

A project is any folder with a `project.json` (or `package.json`) that contains terraform in one of these shapes:

#### var-file layout

One root module shared by all environments; environments differ only in variables and backend:

```
my-infra/
├── project.json
├── main.tf
├── vars/
│   ├── development.tfvars      # one Nx configuration per var file
│   └── production.tfvars
└── backend/
    ├── development.tfbackend   # one backend config per configuration
    └── production.tfbackend
```

The plugin selects the environment via `--var-file=vars/{configuration}.tfvars` and `init --backend-config=backend/{configuration}.tfbackend --reconfigure`. The first var file determines the default configuration. This layout enforces environment parity: the same code is applied everywhere.

#### folder-per-environment layout

One root module per environment (thin wrappers calling shared modules), following the widely used `environments/` convention:

```
my-infra/
├── project.json               # no main.tf at the project root!
├── environments/
│   ├── development/
│   │   ├── main.tf             # one Nx configuration per folder
│   │   └── backend + vars inside the module
│   └── production/
│       └── main.tf
└── modules/                    # ignored — not an environment
    └── vpc/
        └── main.tf
```

The plugin selects the environment by running terraform with `-chdir={projectRoot}/environments/{configuration}`; backend and variables live inside each environment's own module. Environment folders are subfolders of `environments/` that contain a `main.tf`, sorted alphabetically (first = default configuration). This layout allows environments to diverge — that flexibility is the trade-off you opt into.

A project mixing both shapes (root `main.tf` + `vars/` **and** environment folders) is an error.

### Plugin options

Configure via the plugin entry in `nx.json`:

```json
{
  "plugin": "@thdk/nx-terraform/plugin",
  "options": {
    "environmentsDir": "envs",
    "environments": ["development", "production"]
  }
}
```

| Option            | Type     | Default        | Description                                                                                                                                                                                                                               |
| ----------------- | -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environmentsDir` | string   | `environments` | Folder holding the per-environment root modules. Set to `.` for flat layouts (`my-infra/{env}/main.tf`) which requires `environments` to be set explicitly, because a flat environment folder is indistinguishable from a modules folder. |
| `environments`    | string[] | detected       | Explicit environment names. Acts as a filter and defines the order (first entry = default configuration).                                                                                                                                 |

### Inferred targets

This plugin will, once added to your Nx workspace, infer the following targets for all projects that contain a `main.tf` file. The configuration you run a target with (e.g. `nx run my-infra:terraform-apply:production`) propagates down the task dependency chain, so init always runs against the backend of the configuration you are targeting.

#### terraform-init

Runs `terraform init` for the selected configuration (var-file layout: with `--backend-config=backend/{configuration}.tfbackend --reconfigure`; folder layout: inside the environment folder). Not cached, so it re-runs (against the right backend for the configuration) before every plan/validate/apply via the task graph.

#### terraform-format

Runs `terraform fmt --write` (cached).

#### terraform-format:check

Runs `terraform fmt --check` (cached).

#### terraform-validate

Runs `terraform validate` (cached). Depends on `terraform-init`.

#### terraform-plan

Runs `terraform plan --out=tfplan` for the selected configuration (var-file layout: with `--var-file=vars/{configuration}.tfvars`). Depends on `terraform-init`.

#### terraform-show

Runs `terraform show tfplan` to render the plan file saved by `terraform-plan`.

#### terraform-apply

Behaves differently locally and in CI (see [Local vs CI behavior](#local-vs-ci-behavior)):

|                | local                                       | CI (`CI` env var set)                  |
| -------------- | ------------------------------------------- | -------------------------------------- |
| command        | `terraform apply [--var-file=...] {args}`   | `terraform apply -input=false tfplan`  |
| approval       | interactive prompt                          | none — the saved plan is applied as-is |
| depends on     | `terraform-init`, `^terraform-apply`        | `terraform-plan`, `^terraform-apply`   |
| extra CLI args | forwarded to `terraform apply` via `{args}` | not supported — pass them at plan time |

The `^terraform-apply` dependency ensures dependency projects are applied before dependent ones.

**Interactive approval (local):** the target runs as a single command so Nx executes it in a pseudo-terminal. In the Nx TUI, focus the running apply task and press `i` to enter interactive mode, then answer terraform's `Do you want to perform these actions?` prompt (or any missing-variable prompt). The diff shown at the prompt is computed by the apply itself, so what you approve is exactly what is applied.

**Passing extra arguments (local):** CLI args are forwarded to the terraform command, e.g.

```sh
pnpm exec nx run my-infra:terraform-apply -- --target=module.my_service
```

#### terraform

Escape hatch for running arbitrary terraform commands against a project (with the correct `-chdir` and after init). CLI args are appended to the command:

```sh
pnpm exec nx run my-infra:terraform -- state list
```

### Local vs CI behavior

The plugin detects CI through the `CI` environment variable (set and not `"false"`) when the project graph is computed. The principle in both environments is the same: _a deliberate decision gates every apply_. Expressed in each environment's terms:

- **Locally**, plan and apply are fully interactive. Apply re-plans internally and waits for your approval on a freshly computed diff. A separate plan run beforehand would be duplicate work, so apply only depends on init.
- **In CI**, apply consumes the `tfplan` artifact produced by `terraform-plan`, guaranteeing that the plan reviewed in the pipeline logs is byte-for-byte what gets applied (terraform fails on a stale plan if state moved in between). Prompts are disabled: the plugin injects `TF_CLI_ARGS_plan: -input=false` and `TF_CLI_ARGS_apply: -auto-approve -input=false` into the task environment, so a missing input fails fast instead of hanging the job at an invisible prompt inside the pseudo-terminal.

The env vars are only injected in CI; locally they are left unset so developer-provided `TF_CLI_ARGS_*` values pass through untouched.

> **Note:** the Nx daemon caches the project graph and does not watch environment variables. When simulating CI locally (`CI=true nx ...`), run `nx reset` first, or the previously computed (non-CI) target configuration will be used.

## Generator

### `project` Generator

The `project` generator scaffolds a new Terraform project in your Nx workspace, adhering to the conventions enforced by the nx-terraform plugin (see above).

#### Usage

```sh
pnpm exec nx generate @thdk/nx-terraform:project <name> \
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
pnpm exec nx generate @thdk/nx-terraform:project my-infra \
  --terraformStateBucketName=my-bucket \
  --terraformStateBucketRegion=eu-west-1 \
  --directory=infra/my-infra \
  --environments=development,production \
  --aws \
  --google
```
