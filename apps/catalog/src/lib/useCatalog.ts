import { useEffect, useState } from 'react';
import type { Catalog } from '../catalog.types';

// The producer (nx-claude:catalog) writes this into public/; BASE_URL keeps the fetch
// correct under any static-hosting subpath.
const DATA_URL = `${import.meta.env.BASE_URL}plugins-catalog.json`;

export function useCatalog(): { data: Catalog | null; error: string | null } {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Catalog) => setData(d))
      .catch((e) => setError(String(e)));
  }, []);

  return { data, error };
}

export { DATA_URL };
