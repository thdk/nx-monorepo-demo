import {
  CreateNodesContextV2,
  createNodesFromFiles,
  CreateNodesResult,
  CreateNodesV2,
} from '@nx/devkit';
import { existsSync, readdirSync } from 'fs';
import { readdir } from 'fs/promises';
import { basename, dirname, join } from 'path';

export interface NxTerraformPluginOptions {
  /**
   * Folder inside a project that holds one root module per environment
   * (folder-per-environment layout). Defaults to 'environments'.
   * Set to '.' for flat layouts where the environment folders sit directly
   * in the project root — this requires `environments` to be set explicitly,
   * since a flat environment folder is structurally indistinguishable from
   * e.g. a modules folder.
   */
  environmentsDir?: string;
  /**
   * Explicit list of environment folder names. When provided, only these
   * folders are treated as environments, in this order — the first entry
   * becomes the default configuration. Folders in the list without a main.tf
   * are ignored. Required when environmentsDir is '.'.
   */
  environments?: string[];
}

// Evaluated when the project graph is computed on the running machine.
const isCI = !!process.env.CI && process.env.CI !== 'false';

export const createNodesV2: CreateNodesV2<NxTerraformPluginOptions> = [
  '**/main.tf',
  async (configFiles, options, context) => {
    return await createNodesFromFiles(
      (configFile, options, context) =>
        createNodesInternal(configFile, options, context),
      configFiles,
      options,
      context,
    );
  },
];

/**
 * How a project materializes its environments. Both layouts map an
 * environment onto an Nx configuration; they only differ in how the
 * terraform command selects it.
 *
 * - var-file layout: one root module at the project root; environments are
 *   `vars/{env}.tfvars` + `backend/{env}.tfbackend` files.
 * - folder-per-environment layout: one root module per environment under
 *   `{environmentsDir}/{env}/`; backend and vars live inside each module.
 */
interface TerraformLayout {
  projectRoot: string;
  configurationsObject: Record<string, unknown>;
  defaultConfiguration: string;
  /** Value for terraform -chdir; may reference $NX_TASK_TARGET_CONFIGURATION. */
  chdir: string;
  /** Extra args for terraform init (var-file layout: backend config). */
  initArgs: string;
  /** Extra args for plan/apply (var-file layout: --var-file). */
  varFileArgs: string;
  initEnv: Record<string, string>;
}

async function createNodesInternal(
  configFilePath: string,
  options: NxTerraformPluginOptions | undefined = {},
  context: CreateNodesContextV2,
) {
  const layout = await resolveLayout(configFilePath, options);
  if (layout === null) {
    return {};
  }

  const {
    projectRoot,
    configurationsObject,
    defaultConfiguration,
    chdir,
    initArgs,
    varFileArgs,
    initEnv,
  } = layout;

  const workspaceRoot = context.workspaceRoot;
  const tf = `terraform -chdir=${chdir}`;

  return {
    projects: {
      [projectRoot]: {
        targets: {
          'terraform-init': {
            executor: 'nx:run-commands',
            options: {
              cwd: workspaceRoot,
              command: `${tf} init${initArgs}`,
              env: initEnv,
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
              cwd: workspaceRoot,
              command: `${tf} validate`,
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          'terraform-plan': {
            dependsOn: ['terraform-init'],
            executor: 'nx:run-commands',
            options: {
              cwd: workspaceRoot,
              command: `${tf} plan --out=tfplan${varFileArgs}`,
              env: {
                // In CI, fail on missing input instead of prompting inside
                // the pty. Locally the key stays unset so plan can prompt for
                // missing variables interactively (options.env would override
                // a developer's own TF_CLI_ARGS_plan otherwise).
                ...(isCI ? { TF_CLI_ARGS_plan: '-input=false' } : {}),
              },
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          'terraform-show': {
            executor: 'nx:run-commands',
            options: {
              cwd: workspaceRoot,
              command: `${tf} show tfplan`,
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          'terraform-apply': {
            executor: 'nx:run-commands',
            // In CI apply consumes the tfplan artifact, so it depends on
            // terraform-plan. Locally apply re-plans internally (showing the
            // diff at the approval prompt), so a separate plan run would be
            // duplicate work — only init is needed.
            dependsOn: isCI
              ? ['terraform-plan', '^terraform-apply']
              : ['terraform-init', '^terraform-apply'],
            options: {
              cwd: workspaceRoot,
              // Must stay a single command: nx:run-commands only runs in a
              // pseudo-terminal (required for interactive approval in the Nx
              // TUI) when there is exactly one command. Running init first for
              // the matching configuration is enforced by the task graph
              // (apply -> plan -> init, configuration propagates down).
              command: isCI
                ? `${tf} apply -input=false tfplan`
                : `${tf} apply${varFileArgs} {args}`,
              env: {
                // In CI, applies must be non-interactive: skip the approval
                // prompt and fail (instead of prompting inside the pty) on
                // any missing input. Locally the key must stay UNSET — not
                // set to '' — because options.env overrides the process env
                // and would clobber a developer's own TF_CLI_ARGS_apply.
                ...(isCI
                  ? { TF_CLI_ARGS_apply: '-auto-approve -input=false' }
                  : {}),
              },
            },
            configurations: configurationsObject,
            defaultConfiguration,
          },
          terraform: {
            executor: 'nx:run-commands',
            dependsOn: ['terraform-init'],
            options: {
              cwd: workspaceRoot,
              command: tf,
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

/**
 * Resolves which layout the matched main.tf belongs to, or null when the
 * file does not identify a terraform project (e.g. a module's main.tf, or
 * an environment folder other than the first — the project is emitted only
 * once, for the first environment).
 */
async function resolveLayout(
  configFilePath: string,
  options: NxTerraformPluginOptions,
): Promise<TerraformLayout | null> {
  const environmentsDir = options.environmentsDir ?? 'environments';
  if (environmentsDir === '.' && !options.environments?.length) {
    throw new Error(
      `nx-terraform: environmentsDir '.' requires the 'environments' plugin option to be set — flat environment folders cannot be told apart from module folders.`,
    );
  }

  const fileDir = dirname(configFilePath);

  // main.tf directly in an Nx project root -> var-file layout.
  if (isNxProject(fileDir)) {
    return await resolveVarFileLayout(fileDir, environmentsDir, options);
  }

  // main.tf in <projectRoot>/<environmentsDir>/<env>/ -> folder-per-environment layout.
  const envName = basename(fileDir);
  const envContainer = dirname(fileDir);
  const projectRoot =
    environmentsDir === '.'
      ? envContainer
      : basename(envContainer) === environmentsDir
        ? dirname(envContainer)
        : null;
  if (projectRoot === null || !isNxProject(projectRoot)) {
    return null;
  }
  if (options.environments && !options.environments.includes(envName)) {
    return null;
  }

  const environments = getEnvironmentFolders(
    projectRoot,
    environmentsDir,
    options.environments,
  );
  // Every environment's main.tf matches the glob; emit the project only once.
  if (envName !== environments[0]) {
    return null;
  }

  const varFileConfigurations = await getConfigurationsFromVarFiles({
    projectRoot,
  });
  if (Object.keys(varFileConfigurations).length > 0) {
    throw new Error(
      `nx-terraform: ${projectRoot} mixes both layouts — it has vars/*.tfvars files and ${environmentsDir}/*/main.tf folders. Use one or the other.`,
    );
  }

  const envPathPrefix = environmentsDir === '.' ? '' : `${environmentsDir}/`;
  return {
    projectRoot,
    configurationsObject: Object.fromEntries(
      environments.map((environment) => [environment, {}]),
    ),
    defaultConfiguration: environments[0],
    chdir: `${projectRoot}/${envPathPrefix}$NX_TASK_TARGET_CONFIGURATION`,
    // Backend and variables live inside each environment's root module.
    initArgs: '',
    varFileArgs: '',
    initEnv: {},
  };
}

async function resolveVarFileLayout(
  projectRoot: string,
  environmentsDir: string,
  options: NxTerraformPluginOptions,
): Promise<TerraformLayout> {
  const configurationsObject = await getConfigurationsFromVarFiles({
    projectRoot,
  });
  const configurations = Object.keys(configurationsObject);
  const environmentFolders = getEnvironmentFolders(
    projectRoot,
    environmentsDir,
    options.environments,
  );

  if (configurations.length > 0 && environmentFolders.length > 0) {
    throw new Error(
      `nx-terraform: ${projectRoot} mixes both layouts — it has vars/*.tfvars files and ${environmentsDir}/*/main.tf folders. Use one or the other.`,
    );
  }
  if (configurations.length === 0) {
    if (environmentFolders.length > 0) {
      throw new Error(
        `nx-terraform: ${projectRoot} uses the folder-per-environment layout but also has a main.tf at the project root. Move it into the environment folders or remove it.`,
      );
    }
    throw new Error(
      `nx-terraform: ${projectRoot} has a main.tf but no environments — add vars/{environment}.tfvars files (var-file layout) or ${environmentsDir}/{environment}/main.tf folders (folder-per-environment layout).`,
    );
  }

  return {
    projectRoot,
    configurationsObject,
    defaultConfiguration: configurations[0],
    chdir: projectRoot,
    initArgs: ` --backend-config=backend/$NX_TASK_TARGET_CONFIGURATION.tfbackend`,
    varFileArgs: ` --var-file=vars/$NX_TASK_TARGET_CONFIGURATION.tfvars`,
    // The backend differs per configuration while .terraform is shared, so
    // switching configurations requires reconfiguring.
    initEnv: { TF_CLI_ARGS_init: `--reconfigure` },
  };
}

function isNxProject(dir: string) {
  return (
    existsSync(join(dir, 'project.json')) ||
    existsSync(join(dir, 'package.json'))
  );
}

/**
 * Environment folders are subfolders of {projectRoot}/{environmentsDir} that
 * contain a main.tf. When an explicit list is configured, it acts as a
 * filter and defines the order (first entry = default configuration);
 * otherwise folders are sorted alphabetically.
 */
function getEnvironmentFolders(
  projectRoot: string,
  environmentsDir: string,
  explicitEnvironments: string[] | undefined,
) {
  const container =
    environmentsDir === '.' ? projectRoot : join(projectRoot, environmentsDir);
  if (!existsSync(container)) {
    return [];
  }
  const detected = readdirSync(container, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(container, entry.name, 'main.tf')),
    )
    .map((entry) => entry.name)
    .sort();
  if (!explicitEnvironments) {
    return detected;
  }
  return explicitEnvironments.filter((environment) =>
    detected.includes(environment),
  );
}

async function getConfigurationsFromVarFiles({
  projectRoot,
}: {
  projectRoot: string;
}) {
  const varsFolder = join(projectRoot, 'vars');
  const varsFiles = existsSync(varsFolder) ? await readdir(varsFolder) : [];

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
    {},
  );
}
