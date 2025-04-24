import { output } from '@nx/devkit';

export function exec(command: string, fn: () => Promise<void>) {
  void fn()
    .then(() => {
      output.success({
        title: `The command '${command}' completed successfully`,
      });
      process.exit(0);
    })
    .catch(() => {
      output.error({
        title: `The command '${command}' failed`,
      });
      process.exit(1);
    });
}
