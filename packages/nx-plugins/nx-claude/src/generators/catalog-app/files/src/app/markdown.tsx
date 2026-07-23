import { marked } from 'marked';

// SKILL.md bodies come from this repo (trusted content), so we render marked output
// directly. If this ever renders third-party content, add a sanitizer (e.g. DOMPurify).
export function Markdown({ source }: { source: string }) {
  const html = marked.parse(source, { async: false }) as string;
  return (
    <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
