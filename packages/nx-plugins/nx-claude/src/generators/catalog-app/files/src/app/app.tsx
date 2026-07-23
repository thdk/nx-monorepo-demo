import { DATA_URL, useCatalog } from '../lib/useCatalog';
import { href, useHashRoute } from '../lib/useHashRoute';
import { Home } from './home';
import { PluginDetail } from './plugin-detail';
import { SkillDetail } from './skill-detail';

export function App() {
  const { data, error } = useCatalog();
  const route = useHashRoute();

  if (error) {
    return (
      <div className="app">
        <main className="state">
          <h1>Plugin catalog</h1>
          <p className="error">
            Could not load <code>{DATA_URL}</code> ({error}).
            <br />
            Generate it first: <code>nx run inthepocket:catalog</code> (or{' '}
            <code>nx serve catalog</code>).
          </p>
        </main>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="app">
        <main className="state">
          <p>Loading catalog…</p>
        </main>
      </div>
    );
  }

  let view;
  if (route.view === 'plugin') {
    view = <PluginDetail catalog={data} name={route.plugin} />;
  } else if (route.view === 'skill') {
    view = (
      <SkillDetail catalog={data} plugin={route.plugin} skill={route.skill} />
    );
  } else {
    view = <Home catalog={data} domain={route.domain} />;
  }

  return (
    <div className="app">
      <nav className="topbar">
        <a className="brand" href={href.home()}>
          {data.marketplace.name}
        </a>
        <span className="topbar-sub">plugin catalog</span>
      </nav>
      {view}
    </div>
  );
}

export default App;
