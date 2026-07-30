import type { Catalog } from '../catalog.types';
import { href } from '../lib/useHashRoute';
import { Breadcrumb } from './breadcrumb';
import { Markdown } from './markdown';

export function SkillDetail({
  catalog,
  plugin,
  skill,
}: {
  catalog: Catalog;
  plugin: string;
  skill: string;
}) {
  const p = catalog.plugins.find((x) => x.name === plugin);
  const s = p?.skills.find((x) => x.name === skill);

  if (!p || !s) {
    return (
      <main className="state">
        <p>
          Skill not found. <a href={href.home()}>Back to catalog</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <Breadcrumb plugin={p} skill={s} />
      <header className="detail-head">
        <h1>
          {s.name}
          {s.userInvocable && (
            <span className="badge" title="user-invocable">
              /
            </span>
          )}
        </h1>
        <p className="desc">{s.description}</p>
      </header>
      <article className="skill-body">
        {s.body ? (
          <Markdown source={s.body} />
        ) : (
          <p className="state">SKILL.md has no body.</p>
        )}
      </article>
    </main>
  );
}
