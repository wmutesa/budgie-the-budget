// Turns check-logos output into the "Logo status" issue body and job summary.
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const changed = r.updated.length + r.found.length + r.added.length;
const section = (title, items) => items.length ? `\n<details><summary>${title} (${items.length})</summary>\n\n${items.map(i => `- ${i}`).join('\n')}\n</details>\n` : '';
const body = `## Logo status

Last checked ${r.checkedAt.slice(0, 16).replace('T', ' ')} UTC.

| | Count |
| --- | --- |
| Companies in the directory | ${r.total} |
| With a logo | ${r.withLogo} |
| Without a logo | ${r.missing.length} |
| **Logos updated this run** | **${r.firstRun ? 'first run, nothing to compare yet' : changed}** |
| Logos that disappeared | ${r.lost.length} |
| Could not be checked | ${r.errors.length} |
| Logo from the second source (DuckDuckGo) | ${(r.fromFallback || []).length} |
${section('Updated logos', r.updated)}${section('Newly found logos', r.found)}${section('New companies with a logo', r.added)}${section('Logos that disappeared', r.lost)}${section('Without a logo: fix the domain in src/data/directory.js', r.missing)}${section('Could not be checked', r.errors)}${section('Logo from the second source (DuckDuckGo)', r.fromFallback || [])}
In the app, anyone can fix a single logo by clicking it.

<!-- logo-state ${JSON.stringify(r.state)} -->
`;
process.stdout.write(body);
