# List of steps executed to create this repo

## ..

### Infra setup

#### New plugin to infer terraform targets automatically

```sh
npx nx add @nx/plugin
npx nx g plugin tools/nx-terraform
```

Note: when using plugins locally for inferring tasks, nx, must be able to resolve the plugin without having the plugin built.
Therefore some logic is applied by nx to detect the file that exposes the plugin.
https://github.com/nrwl/nx/pull/29222
