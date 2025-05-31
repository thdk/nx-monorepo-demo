/* This is a copy of the original file from the Nx repository but it wasn't exported */
import { output } from '@nx/devkit';

export function logShowProjectCommand(projectName: string): void {
  output.log({
    title: `👀 View Details of ${projectName}`,
    bodyLines: [
      `Run "nx show project ${projectName}" to view details about this project.`,
    ],
  });
}
