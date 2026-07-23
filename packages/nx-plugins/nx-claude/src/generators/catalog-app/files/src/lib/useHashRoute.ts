import { useEffect, useState } from 'react';

// Hash routing keeps the app a pure static site — deep links work under any host/subpath
// with no server rewrites.
export type Route =
  | { view: 'home'; domain?: string }
  | { view: 'plugin'; plugin: string }
  | { view: 'skill'; plugin: string; skill: string };

export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === 'plugin' && parts[1])
    return { view: 'plugin', plugin: parts[1] };
  if (parts[0] === 'skill' && parts[1] && parts[2]) {
    return { view: 'skill', plugin: parts[1], skill: parts[2] };
  }
  if (parts[0] === 'domain' && parts[1])
    return { view: 'home', domain: parts[1] };
  return { view: 'home' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const href = {
  home: () => '#/',
  domain: (domain: string) => `#/domain/${encodeURIComponent(domain)}`,
  plugin: (name: string) => `#/plugin/${encodeURIComponent(name)}`,
  skill: (plugin: string, skill: string) =>
    `#/skill/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`,
};
