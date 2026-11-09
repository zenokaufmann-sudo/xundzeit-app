export interface SyncKonfig { token: string; repo: string }

export class SyncFehler extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

async function api<T>(k: SyncKonfig, pfad: string, init?: RequestInit): Promise<T> {
  let antwort: Response
  try {
    antwort = await fetch(`https://api.github.com/repos/${k.repo}/${pfad}`, {
      ...init,
      // GitHub erlaubt Browsern 60 s Zwischenspeicher. Ein veralteter Stand führt beim Schreiben zu Fehler 422.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${k.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch {
    throw new SyncFehler('GitHub ist nicht erreichbar')
  }
  if (antwort.status === 401) throw new SyncFehler('Token abgelaufen oder ungültig', 401)
  if (antwort.status === 403) throw new SyncFehler('Token hat keine Berechtigung für das Repo', 403)
  if (antwort.status === 404) throw new SyncFehler('Repo nicht gefunden oder kein Zugriff', 404)
  if (antwort.status === 422) throw new SyncFehler('GitHub hat die Änderung abgelehnt, der nächste Sync versucht es erneut', 422)
  if (!antwort.ok) throw new SyncFehler(`GitHub antwortet mit Fehler ${antwort.status}`, antwort.status)
  return antwort.json() as Promise<T>
}

/** Pfad zu Git-Hash aller Dateien im Repo. */
export async function baum(k: SyncKonfig): Promise<Map<string, string>> {
  const t = await api<{ tree: { path: string; type: string; sha: string }[] }>(k, 'git/trees/main?recursive=1')
  return new Map(t.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]))
}

export async function blob(k: SyncKonfig, sha: string): Promise<string> {
  const b = await api<{ content: string }>(k, `git/blobs/${sha}`)
  const roh = atob(b.content.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(roh, (c) => c.charCodeAt(0)))
}

/** Schreibt alle Dateien als einen einzigen Commit. */
export async function commit(k: SyncKonfig, dateien: { pfad: string; inhalt: string }[], nachricht: string) {
  const ref = await api<{ object: { sha: string } }>(k, 'git/ref/heads/main')
  const basis = await api<{ tree: { sha: string } }>(k, `git/commits/${ref.object.sha}`)
  const neuerBaum = await api<{ sha: string }>(k, 'git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: basis.tree.sha,
      tree: dateien.map((d) => ({ path: d.pfad, mode: '100644', type: 'blob', content: d.inhalt })),
    }),
  })
  const neu = await api<{ sha: string }>(k, 'git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: nachricht, tree: neuerBaum.sha, parents: [ref.object.sha] }),
  })
  await api(k, 'git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: neu.sha }) })
}

/** Derselbe Hash, den Git für den Dateiinhalt berechnet. */
export async function gitSha(text: string): Promise<string> {
  const inhalt = new TextEncoder().encode(text)
  const kopf = new TextEncoder().encode(`blob ${inhalt.length}\0`)
  const daten = new Uint8Array(kopf.length + inhalt.length)
  daten.set(kopf)
  daten.set(inhalt, kopf.length)
  const hash = await crypto.subtle.digest('SHA-1', daten)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
