import type { CatalogPlugin, CatalogSkill } from '../catalog.types';
import { href } from '../lib/useHashRoute';

// A navigable hierarchy: catalog → domain → plugin → (skills → skill).
// The plugin lives in the last folder segment; segments above it are domain containers.
// The current page is the last crumb (not a link).
export function Breadcrumb({
  plugin,
  skill,
}: {
  plugin: CatalogPlugin;
  skill?: CatalogSkill;
}) {
  const ancestors = plugin.path.slice(0, -1); // domain (+ any deeper containers)
  const folder = plugin.path[plugin.path.length - 1] ?? plugin.name;

  const items: Array<{ label: string; to?: string }> = [
    { label: 'catalog', to: href.home() },
  ];
  // Only the top-level segment is a filter facet; deeper containers are shown but not linked.
  ancestors.forEach((seg, i) =>
    items.push({ label: seg, to: i === 0 ? href.domain(seg) : undefined }),
  );
  // The plugin folder: a link on the skill page, the current page on the plugin page.
  items.push({
    label: folder,
    to: skill ? href.plugin(plugin.name) : undefined,
  });
  if (skill) {
    items.push({ label: 'skills', to: href.plugin(plugin.name) });
    items.push({ label: skill.name });
  }

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span className="crumb" key={`${i}-${it.label}`}>
          {i > 0 && <span className="crumb-sep">/</span>}
          {it.to ? (
            <a href={it.to}>{it.label}</a>
          ) : (
            <span aria-current="page">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
