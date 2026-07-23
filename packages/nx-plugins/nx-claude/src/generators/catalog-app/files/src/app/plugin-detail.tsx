import { useState } from 'react';
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
