export function imSafariTab(): boolean {
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const installiert =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches
  let erlaubt = false
  try {
    erlaubt = sessionStorage.getItem('xundzeit-browser') === '1'
  } catch {
    // Privater Modus: dann bleibt der Hinweis stehen.
  }
  return iOS && !installiert && !erlaubt
}

export function InstallHinweis({ onTrotzdem }: { onTrotzdem: () => void }) {
  return (
    <main className="install">
      <h1>Xundzeit</h1>
      <p>Deine Einträge liegen in der App auf dem Home-Bildschirm. Safari hat einen eigenen, getrennten Speicher.</p>
      <ol>
        <li>Unten auf das Teilen-Symbol tippen.</li>
        <li>«Zum Home-Bildschirm» wählen.</li>
        <li>Xundzeit ab jetzt über das Icon öffnen.</li>
      </ol>
      <p className="leise">Ist die App schon installiert? Dann öffne sie direkt über das Icon.</p>
      <button
        className="textknopf"
        onClick={() => {
          try {
            sessionStorage.setItem('xundzeit-browser', '1')
          } catch {
            // Ohne Speicher gilt die Wahl nur für diesen Aufruf.
          }
          onTrotzdem()
        }}
      >
        Trotzdem im Browser ansehen
      </button>
    </main>
  )
}
