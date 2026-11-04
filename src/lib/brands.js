// Find a service on the web by name. Wikidata gives the name, a short
// description and the official website; the logo is the site's own icon.
const WD = 'https://www.wikidata.org/w/api.php';

export const logoUrl = domain => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

export async function searchBrands(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];
  const searchUrl = `${WD}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&type=item&limit=8&format=json&origin=*`;
  const found = await (await fetch(searchUrl, { signal })).json();
  const items = (found.search || []).map(x => ({ id: x.id, name: x.label || x.id, description: x.description || '' }));
  if (!items.length) return [];

  const ids = items.map(i => i.id).join('|');
  const detailUrl = `${WD}?action=wbgetentities&ids=${ids}&props=claims&format=json&origin=*`;
  const details = await (await fetch(detailUrl, { signal })).json();

  return items
    .map(i => {
      const site = details.entities?.[i.id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;
      let domain = null;
      try { domain = site ? new URL(site).hostname.replace(/^www\./, '') : null; } catch { domain = null; }
      return { ...i, website: site, domain, logo: domain ? logoUrl(domain) : null };
    })
    .filter(i => i.domain);
}
