import { releaseVersion } from 'nx/release';
import { $ } from 'zx';

export function filterVersionedProjects({
  projectsVersionData,
}: Awaited<ReturnType<typeof releaseVersion>>): string[] {
  return Object.entries(projectsVersionData)
    .filter(([, versionData]) => versionData.newVersion !== null)
    .map(([project]) => project);
}

export async function getProjectsToVersion({
  tag,
  affected,
  projects,
}: {
  tag?: string;
  affected?: boolean;
  projects?: string[];
}) {
  const listProjectsCommandArgs = [`--json`];

  // Add --projects filter if required
  if (tag || projects?.length) {
    listProjectsCommandArgs.push(
      `--projects=${tag ? `tag:${tag}` : ''}${
        projects?.length ? ` ${projects.join(' ')}` : ''
      }`
    );
  }

  // Add --affected filter if required
  if (affected) {
    listProjectsCommandArgs.push(`--affected`);
  }

  const { stdout: allApplications } =
    await $`npx nx show projects ${listProjectsCommandArgs}`;

  return JSON.parse(allApplications);
}
