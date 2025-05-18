import { output } from '@nx/devkit';

export function exec(command: string, fn: () => Promise<void>) {
  void fn()
    .then(() => {
      output.success({
        title: `The command '${command}' completed successfully`,
      });
      process.exit(0);
    })
    .catch((e) => {
      const bodyLines = [e.message, e.stack];
      output.error({
        title: `The command '${command}' failed`,
        bodyLines,
      });
      process.exit(1);
    });
}
