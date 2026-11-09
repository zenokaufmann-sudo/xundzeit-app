# Xundzeit

Persönliches Kopfweh- und Gesundheitstagebuch als PWA fürs iPhone. Ziel ist, mit ein bis zwei kurzen Eingaben pro Tag Auslöser zu erkennen.

Die App enthält keine Gesundheitsdaten. Einträge liegen auf dem Gerät und in einem separaten, privaten Daten-Repo. Xundzeit stellt keine Diagnosen.

App: <https://zenokaufmann-sudo.github.io/xundzeit-app/>

## Einrichten auf dem iPhone

### 1. Installieren
1. Die App-Adresse in **Safari** öffnen.
2. Teilen-Symbol, dann **Zum Home-Bildschirm**, dann **Hinzufügen**.
3. Ab jetzt immer übers Icon öffnen. Safari und die installierte App haben getrennte Speicher. Im Safari-Tab eingegebene Daten wären in der App nicht da.

### 2. Einstellungen ausfüllen
- **Wohnort** suchen. Ohne Wohnort gibt es keine Wetterdaten. Fehlende Tage werden nachgeladen, sobald er gesetzt ist.
- Bei den **Medikamenten** die Namen der beiden Nasensprays anpassen, falls gewünscht.

### 3. GitHub-Token erstellen
1. Auf GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name frei wählen, Ablauf nach Wunsch, zum Beispiel 1 Jahr.
3. **Repository access → Only select repositories** und nur das Daten-Repo wählen.
4. **Permissions → Repository permissions → Contents → Read and write**.
5. Token kopieren und in der App unter **Einstellungen → GitHub-Sync** einfügen.

Der Token bleibt auf dem Gerät. Nicht in Chats, Notizen oder Dateien ablegen. Läuft er ab, zeigt die App das in den Einstellungen an.

### 4. Erinnerung um 21:30
Web-Push ist für solche Apps auf iOS unzuverlässig. Am einfachsten geht es mit der App **Erinnerungen**:

1. Neue Erinnerung «Check-in».
2. **Datum** und **Uhrzeit** 21:30, **Wiederholen: Täglich**.
3. Bei der Erinnerung die App übers Icon öffnen.

Mit Link statt Icon, in der App **Kurzbefehle**:

1. **Automation → Neue Automation → Tageszeit**, 21:30, täglich.
2. Aktion **URL öffnen** mit der App-Adresse und `?tab=heute`.

iOS öffnet solche Links meist in Safari, also nicht in der installierten App. Die App zeigt dann «Bitte vom Home-Bildschirm öffnen». In diesem Fall die Variante mit Erinnerungen nutzen.

## Bedienung

| Tab | Inhalt |
|---|---|
| Heute | Check-in nach Uhrzeit (bis 15 Uhr Morgen, danach Abend), Kopfweh, Nasensprays, Krankheit |
| Kopfweh | Erfassen mit Kopf-Karte, Stärke, Medikament und Wirkung |
| Verlauf | Kalender, jeder Tag lässt sich rückwirkend bearbeiten |
| Analyse | Kennzahlen, Auslöser-Vergleich, Verläufe und Wochenreport |
| Einstellungen | Wohnort, Medikamente, CSV-Export, GitHub-Sync |

Gestrichelte Werte sind Vorschläge. Sie zählen erst, wenn du sie antippst oder mit «Stimmt so» bestätigst. Bis 04:00 zählt noch zum Vortag.

**Sync:** Läuft nur bei offener App, beim Öffnen, nach Änderungen und sobald wieder Netz da ist. Für den Sonntagsreport die App vor 17:00 einmal öffnen.

**Auslöser-Vergleich:** Vergleicht die Kopfweh-Rate an Tagen mit und ohne Faktor, nur für Tage mit bekanntem Wert. Unter 5 Tagen pro Gruppe steht «zu wenig Daten». Ein Zusammenhang ist noch keine Ursache.

**CSV-Export:** `tage.csv`, `kopfweh.csv` und `einnahmen.csv`, mit Semikolon und UTF-8 mit BOM für Excel. Leere Zellen heissen «nicht erfasst».

## Datenstruktur

Das Daten-Repo enthält `entries/`, `krankheiten/`, `garmin/` und `reports/`. Das genaue Format steht in [daten-vorlage/schema.md](daten-vorlage/schema.md), erfundene Beispiele liegen in [daten-vorlage/beispiele](daten-vorlage/beispiele).

Die App schreibt `entries/` und `krankheiten/`. `garmin/` und `reports/` schreiben zwei geplante Claude-Aufgaben, die App liest sie nur.

## Entwicklung

```bash
npm install
npm run dev
npm test
npm run e2e
```

Vite, React, TypeScript, Dexie und vite-plugin-pwa. Jeder Push auf `main` wird getestet und über GitHub Pages veröffentlicht.
