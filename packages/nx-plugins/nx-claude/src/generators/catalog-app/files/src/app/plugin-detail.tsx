import { useMemo, useState } from 'react';
import type { Catalog } from '../catalog.types';
import { href } from '../lib/useHashRoute';
import { Breadcrumb } from './breadcrumb';

export function PluginDetail({
  catalog,
  name,
}: {
  catalog: Catalog;
  name: string;
}) {
  const [copied, setCopied] = useState(false);
  const plugin = catalog.plugins.find((p) => p.name === name);

  // Reverse index: plugins in this marketplace that depend on this one. Derived
  // here rather than emitted by the catalog builder so the document stays normalized.
  const dependents = useMemo(
    () =>
      catalog.plugins.flatMap((p) => {
        const dep = p.dependencies?.find((d) => d.local && d.name === name);
        return dep ? [{ plugin: p, range: dep.range }] : [];
      }),
    [catalog, name],
  );

  if (!plugin) {
    return (
      <main className="state">
        <p>
          Plugin “{name}” not found. <a href={href.home()}>Back to catalog</a>
        </p>
      </main>
    );
  }

  const install = `claude plugin install ${plugin.name}@${catalog.marketplace.name}`;
  const copy = () => {
    navigator.clipboard?.writeText(install).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main>
      <Breadcrumb plugin={plugin} />
      <header className="detail-head">
        <h1>
          {plugin.name} <span className="version">v{plugin.version}</span>
        </h1>
        {plugin.description && <p className="desc">{plugin.description}</p>}
      </header>

      <section className="install">
        <h3>Install</h3>
        <div className="install-row">
          <pre>
            <code>{install}</code>
          </pre>
          <button className="copy" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      {(plugin.author ||
        plugin.license ||
        plugin.repository ||
        plugin.keywords?.length) && (
        <section className="meta">
          {plugin.author && (
            <div>
              <span>Author</span> {plugin.author.name}
            </div>
          )}
          {plugin.license && (
            <div>
              <span>License</span> {plugin.license}
            </div>
          )}
          {plugin.repository && (
            <div>
              <span>Repository</span>{' '}
              <a href={plugin.repository} target="_blank" rel="noreferrer">
                {plugin.repository}
              </a>
            </div>
          )}
          {plugin.keywords && plugin.keywords.length > 0 && (
            <div>
              <span>Keywords</span> {plugin.keywords.join(', ')}
            </div>
          )}
        </section>
      )}

      {plugin.dependencies && plugin.dependencies.length > 0 && (
        <section>
          <h3>Depends on</h3>
          <ul className="deps">
            {plugin.dependencies.map((d) => (
              <li key={d.name}>
                {d.local ? (
                  <a href={href.plugin(d.name)} className="dep-name">
                    {d.name}
                  </a>
                ) : (
                  <span className="dep-name">
                    {d.name}
                    <span className="badge" title="not in this marketplace">
                      external
                    </span>
                  </span>
                )}
                <code className="dep-range">{d.range ?? 'any version'}</code>
                {d.local && d.resolvedVersion && (
                  <span className="dep-resolved">
                    currently v{d.resolvedVersion}
                    {d.satisfied === false && (
                      <span
                        className="dep-warn"
                        title="the current version does not satisfy the declared range"
                      >
                        out of range
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dependents.length > 0 && (
        <section>
          <h3>Used by</h3>
          <p className="hint">
            These plugins receive a patch release whenever {plugin.name} is
            released.
          </p>
          <ul className="deps">
            {dependents.map(({ plugin: p, range }) => (
              <li key={p.name}>
                <a href={href.plugin(p.name)} className="dep-name">
                  {p.name}
                </a>
                <code className="dep-range">{range ?? 'any version'}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>
          {plugin.skills.length} skill{plugin.skills.length === 1 ? '' : 's'}
        </h3>
        <ul className="skills">
          {plugin.skills.map((s) => (
            <li key={s.name}>
              <a href={href.skill(plugin.name, s.name)} className="skill-name">
                {s.name}
                {s.userInvocable && (
                  <span className="badge" title="user-invocable">
                    /
                  </span>
                )}
              </a>
              <span className="skill-desc">{s.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
