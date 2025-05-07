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
