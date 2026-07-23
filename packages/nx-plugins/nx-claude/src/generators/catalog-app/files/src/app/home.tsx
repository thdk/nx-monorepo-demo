import { useMemo, useState } from 'react';
import type { Catalog } from '../catalog.types';
import { href } from '../lib/useHashRoute';

type Mode = 'plugins' | 'skills';

// `domain` comes from the route (#/domain/<d>) so it's deep-linkable and breadcrumb-consistent.
export function Home({
  catalog,
  domain,
}: {
  catalog: Catalog;
  domain?: string;
}) {
  const [mode, setMode] = useState<Mode>('plugins');
  const [query, setQuery] = useState('');

  const domains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalog.plugins) {
      const d = p.path[0];
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const q = query.trim().toLowerCase();

  const plugins = useMemo(
    () =>
      catalog.plugins.filter(
        (p) =>
          (!domain || p.path[0] === domain) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            (p.description?.toLowerCase().includes(q) ?? false) ||
            (p.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false) ||
            p.path.some((s) => s.toLowerCase().includes(q))),
      ),
    [catalog, domain, q],
  );

  const skills = useMemo(() => {
    const all = catalog.plugins.flatMap((p) =>
      p.skills.map((s) => ({ skill: s, plugin: p })),
    );
    return all.filter(
      ({ skill, plugin }) =>
        (!domain || plugin.path[0] === domain) &&
        (!q ||
          skill.name.toLowerCase().includes(q) ||
          skill.description.toLowerCase().includes(q) ||
          plugin.name.toLowerCase().includes(q)),
    );
  }, [catalog, domain, q]);

  const totalSkills = catalog.plugins.reduce((n, p) => n + p.skills.length, 0);

  return (
    <main>
      <header className="hero">
        <h1>{catalog.marketplace.name}</h1>
        {catalog.marketplace.description && (
          <p className="tagline">{catalog.marketplace.description}</p>
        )}
        <p className="counts">
          {catalog.plugins.length} plugins · {totalSkills} skills
        </p>

        <div className="modes" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'plugins'}
            className={mode === 'plugins' ? 'active' : ''}
            onClick={() => setMode('plugins')}
          >
            Plugins
          </button>
          <button
            role="tab"
            aria-selected={mode === 'skills'}
            className={mode === 'skills' ? 'active' : ''}
            onClick={() => setMode('skills')}
          >
            Skills
          </button>
        </div>

        <input
          className="search"
          type="search"
          placeholder={
            mode === 'plugins' ? 'Search plugins…' : 'Search skills…'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="chips">
          <a className={!domain ? 'chip active' : 'chip'} href={href.home()}>
            all
          </a>
          {domains.map(([d, n]) => (
            <a
              key={d}
              className={domain === d ? 'chip active' : 'chip'}
              href={domain === d ? href.home() : href.domain(d)}
            >
              {d} <span className="chip-count">{n}</span>
            </a>
          ))}
        </div>
      </header>

      {mode === 'plugins' ? (
        <section className="grid">
          {plugins.map((p) => (
            <a key={p.name} className="card" href={href.plugin(p.name)}>
              <div className="card-head">
                <h2>{p.name}</h2>
                <span className="version">v{p.version}</span>
              </div>
              <p className="path">{p.path.join(' / ')}</p>
              {p.description && <p className="desc">{p.description}</p>}
              <p className="counts">
                {p.skills.length} skill{p.skills.length === 1 ? '' : 's'}
              </p>
            </a>
          ))}
          {plugins.length === 0 && <p className="state">No plugins match.</p>}
        </section>
      ) : (
        <section className="list">
          {skills.map(({ skill, plugin }) => (
            <a
              key={`${plugin.name}/${skill.name}`}
              className="row"
              href={href.skill(plugin.name, skill.name)}
            >
              <span className="row-name">
                {skill.name}
                {skill.userInvocable && (
                  <span className="badge" title="user-invocable">
                    /
                  </span>
                )}
              </span>
              <span className="row-plugin">{plugin.name}</span>
              <span className="row-desc">{skill.description}</span>
            </a>
          ))}
          {skills.length === 0 && <p className="state">No skills match.</p>}
        </section>
      )}
    </main>
  );
}
