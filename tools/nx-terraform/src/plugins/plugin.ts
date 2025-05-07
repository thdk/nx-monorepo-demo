import {
  CreateNodesContextV2,
  createNodesFromFiles,
  CreateNodesResult,
  CreateNodesV2,
} from '@nx/devkit';
import { existsSync } from 'fs';
import {readdir} from 'fs/promises';
import { dirname, join } from 'path';

 
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
export interface NxTerraformPluginOptions {
}

export const createNodesV2: CreateNodesV2<NxTerraformPluginOptions> = [
  '**/main.tf',
  async (configFiles, options, context) => {
    return await createNodesFromFiles(
      (configFile, options, context) =>
        createNodesInternal(configFile, options, context),
      configFiles,
      options,
      context
    );
  },
];

async function createNodesInternal(
  configFilePath: string,
  options: NxTerraformPluginOptions | undefined = {},
  context: CreateNodesContextV2
) {
  const projectRoot = dirname(configFilePath);
  const isProject =
    existsSync(join(projectRoot, 'project.json')) ||
    existsSync(join(projectRoot, 'package.json'));
  if (!isProject) {
    return {};
  }

  const configurationsObject = await getConfigurationsFromVarFiles({
    projectRoot,
  });

  const defaultConfiguration = Object.keys(configurationsObject)[0];

  return {
    projects: {
      [projectRoot]: {
        targets: {
          'terraform-init': {
            executor: 'nx:run-commands',
            options: {
              parallel: false,
              cwd: projectRoot,
              commands: [
                'terraform init',
                'echo $NX_TASK_TARGET_CONFIGURATION > .terraform/init-configuration',
              ],
              env: {
                TF_CLI_ARGS_init: '--backend-config=backend/$NX_TASK_TARGET_CONFIGURATION.tfbackend --reconfigure'
              }
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          'terraform-format': {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              commands: ['terraform fmt --diff --recursive --write'],
              cwd: projectRoot,
            },
          },
          'terraform-format:check': {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              commands: ['terraform fmt --diff --recursive --check'],
              cwd: projectRoot,
            },
          },
          'terraform-validate': {
            dependsOn: ['terraform-init'],
            executor: 'nx:run-commands',
            cache: true,
            options: {
              cwd: projectRoot,
              command: 'terraform validate',
            },
          },
          'terraform-plan': {
            dependsOn: ['terraform-init'],
            executor: 'nx:run-commands',
            options: {
              cwd: projectRoot,
              command: 'terraform plan --out=tfplan --var-file=vars/$NX_TASK_TARGET_CONFIGURATION.tfvars',
              env: {
                TF_CLI_ARGS_plan: '--input=false',
              },
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          'terraform-show': {
            executor: 'nx:run-commands',
            options: {
              cwd: projectRoot,
              command: 'terraform show tfplan',
            },
          },
          'terraform-apply': {
            executor: 'nx:run-commands',
            dependsOn: ['terraform-plan', '^docker-build', '^terraform-apply'],
            options: {
              parallel: false,
              cwd: projectRoot,
              commands:
                [
                  "[ $(cat .terraform/init-configuration) = $NX_TASK_TARGET_CONFIGURATION ] && exit 0 || echo 'First run terraform-init for this configuration!' && exit 1",
                  'terraform apply --var-file=vars/$NX_TASK_TARGET_CONFIGURATION.tfvars',
                ],
              env: {
                TF_CLI_ARGS_apply: '--auto-approve',
              }
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
        },
      },
    },
  } satisfies CreateNodesResult;
}

/** Helper functions */

async function getConfigurationsFromVarFiles({
  projectRoot,
}: {
  projectRoot: string;
}) {
  const varsFolder = join(projectRoot, 'vars');
  const varsFiles = existsSync(varsFolder)
    ? await readdir(varsFolder)
    : [];



  const configurations = varsFiles.map((file) => {
    const match = file.match(/(.*)\.tfvars/);
    if (match === null) {
      throw new Error(`Invalid file name: ${file}`);
    }
    const configuration = match[1];
    return configuration;
  });

  const configurationsSet = new Set(configurations);

  return Array.from(configurationsSet).reduce<Record<string, unknown>>(
    (acc, configuration) => {
      acc[configuration] = {};
      return acc;
    },
    {}
  );
}