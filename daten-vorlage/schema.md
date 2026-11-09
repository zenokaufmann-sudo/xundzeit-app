# Xundzeit: Datenstruktur

Dieses Repo enthält die persönlichen Gesundheitsdaten der Xundzeit-App. Es muss privat bleiben.

| Pfad | Geschrieben von | Inhalt |
|---|---|---|
| `entries/YYYY-MM-DD.json` | App | Tageseintrag mit Kopfweh-Episoden und Nasenspray-Einnahmen |
| `krankheiten/<id>.json` | App | Krankheit über mehrere Tage |
| `garmin/YYYY-MM-DD.json` | Claude (täglich) | Garmin-Daten eines Tages |
| `reports/YYYY-Www.json` + `.md` | Claude (Sonntag) | Wochenreport |
| `beispiele/` | einmalig | Erfundene Beispiele für das Format. Nie auswerten |

Datum `YYYY-MM-DD`, Zeitpunkte ISO 8601 mit lokalem Offset, Woche nach ISO 8601 (`2026-W45`), Einheiten metrisch.

## Regeln zum Lesen

**Fehlt ein Feld, ist es nicht erfasst.** Das heisst nicht «Nein». Vergleiche nur Tage, an denen der Wert vorhanden ist. Ausnahme: Nasensprays, siehe unten.

**Logischer Tag.** Der Tag läuft bis 04:00 Uhr. Was davor passiert, gehört zum Vortag.

**Zuordnung zum Tag.**
- `alkohol` steht beim Tag, an dem getrunken wurde. Als Auslöser zählt er für den **Folgetag**.
- `nacht` (Schlaf, Display, Licht aus) steht beim **Aufwachtag**, beschreibt also die Nacht davor.
- Eine Episode steht beim Tag ihres Beginns.
- Eine Krankheit gilt für alle Tage von `beginn` bis `ende`. Ohne `ende` läuft sie noch.

**Datenqualität.** `quelle`: `erfasst` (einzeln eingegeben), `wie-gestern` (vom Vortag übernommen, danach eventuell angepasst), `nachgetragen-wie-ueblich` (rückwirkend mit einem Tap: kein Kopfweh und übliche Werte). Nachgetragene Tage zählen schwächer.

**Gelöscht.** Einträge mit `deletedAt` nicht auswerten.

**Nasensprays ohne Einnahme.** Keine Auswahl heisst «nicht genommen», sobald der zugehörige Check-in begonnen wurde. Ist er gar nicht ausgefüllt, ist der Wert unbekannt.
- Morgen begonnen: `nacht.schlafSubjektiv` oder `nacht.display` vorhanden.
- Abend begonnen: eines von `koffein`, `suessgetraenke`, `massage`, `kopfBelastung`, `koerperBelastung`, `befinden` vorhanden. `kopfwehStatus` zählt nicht.
- Kortison morgens hängt am Morgen, abends am Abend. Abschwellend gilt für den ganzen Tag, wenn einer der beiden begonnen wurde.

## `entries/YYYY-MM-DD.json`

| Feld | Typ | Bedeutung |
|---|---|---|
| `datum`, `schemaVersion`, `quelle`, `updatedAt` | | Siehe oben |
| `stempel` | Objekt | Änderungszeit pro Bereich, nur für den Sync |
| `kopfwehStatus` | `keines` \| `hatte` | Fehlt: unbekannt |
| `nacht.schlafSubjektiv` | 1–5 | 1 sehr schlecht, 5 sehr gut |
| `nacht.display` | `keine` \| `<15` \| `15-60` \| `>60` | Bildschirm in der letzten Stunde vor dem Schlafen (Minuten) |
| `nacht.lichtAus` | `HH:MM` | Optional |
| `koffein` | `{ja, portionen?, letzte?, zeit?}` | `letzte`: `vor12` \| `nach12`, `zeit`: `HH:MM` |
| `alkohol` | `{ja, getraenke?, zeitpunkt?}` | Standardgetränke, `bis18` \| `abend` \| `spaet` |
| `suessgetraenke` | `{ja, anzahl?}` | Gläser oder Dosen |
| `wasser` | `wenig` \| `normal` \| `viel` | Optional |
| `massage` | `{ja, art?, regionen?}` | `professionell` \| `selbst` \| `rolle` \| `pistole`; `nacken` \| `schultern` \| `ruecken` \| `beine` \| `ganzkoerper` |
| `kopfBelastung` | 1–5 | Sehr gemütlich, locker, normal, streng, ultra streng |
| `koerperBelastung` | `{stufe, vorschlagGarmin?}` | Recovery Day, leicht aktiv, moderat, hart, sehr viel Sport |
| `befinden` | 1–5 | Schlecht bis sehr gut |
| `notiz` | Text | Optional |
| `episoden` | Liste | Siehe unten |
| `einnahmen` | Liste | Siehe unten |
| `kontext.wetter` | Objekt | Siehe unten |
| `kontext.mond` | `{phase, beleuchtung, kategorie}` | `phase` 0–1 (0 Neumond), `beleuchtung` in %, `neumond` \| `zunehmend` \| `vollmond` \| `abnehmend` |

### Kopfweh-Episode

| Feld | Bedeutung |
|---|---|
| `id`, `updatedAt`, `deletedAt?` | |
| `phasen?` | Gewählte Tageszeiten: `nacht-frueh` (bis 6), `morgen` (6–11), `mittag` (11–14), `nachmittag` (14–18), `abend` (18–22), `nacht-spaet` (ab 22). **Wenn vorhanden, massgebend** |
| `beginn`, `ende?` | Exakt nur ohne `phasen`. Mit `phasen` nur ungefähr, die Dauer ist dann grob. `nacht-frueh` hat als Platzhalter 04:00 |
| `laeuft?` | Ausdrücklich als laufend markiert |
| `erwachtMit?` | Mit Kopfweh aufgewacht |
| `zonen` | `stirn-l/m/r`, `schlaefe-l/r`, `auge-l/r`, `scheitel`, `hinterkopf-l/r`, `nacken-l/r` |
| `staerke?`, `staerkeMax?` | 1 leicht, 2 mittel, 3 stark |
| `schmerzart?` | `pochend`, `drueckend`, `stechend` |
| `symptome?` | `licht`, `laerm`, `uebelkeit`, `aura`, `bewegung`, `nacken` |
| `keinMedikament?` | Ausdrücklich kein Medikament |
| `medikamente` | `{id, name, dosisMg?, zeit, wirkung?}`; `wirkung`: `keine`, `etwas`, `deutlich`, `schmerzfrei` |
| `ursachen?`, `ursacheText?` | `schlaf`, `trinken`, `mahlzeit`, `stress`, `bildschirm`, `sport`, `alkohol`, `koffein`, `wetter`, `sonne`, `nacken`, `krankheit` |

### Nasenspray-Einnahme

`{id, typ, name, zeit, deletedAt?}`. `zeit` ist nur der Moment des Eintragens, nie die Einnahmezeit.
- `typ: abschwellend`: `zeitpunkt` ist `aufstehen`, `mittags`, `nachmittags`, `abends` oder `schlafen`.
- `typ: kortison`: `slot` ist `morgens` oder `abends`, `stoesse` 1 oder 2 pro Nasenloch.

### Wetter

| Feld | Bedeutung |
|---|---|
| `druckMittel`, `druckMin`, `druckMax` | Luftdruck (pressure_msl) in hPa |
| `delta24h` | Änderung zum Vortag in hPa, gemessen an der letzten Stunde des Tages. Negativ: Abfall |
| `maxDelta3h` | Grösste Änderung innerhalb von 3 Stunden, mit Vorzeichen |
| `tempMittel`, `feuchte` | °C, % |
| `ort` | Name des Orts |
| `vorlaeufig?` | Noch auf Prognose beruhend, wird später ersetzt |

## `krankheiten/<id>.json`

`{id, updatedAt, deletedAt?, art?, artText?, symptome, temperatur?, schweregrad?, sportpause?, beginn, ende?}`

`art`: `erkaeltung`, `grippe`, `magen-darm`, `covid`, `verletzung`, `sonstiges`. `symptome`: `fieber`, `halsweh`, `schnupfen`, `verstopft`, `nebenhoehlen`, `stirnhoehlen`, `husten`, `gliederschmerzen`, `muedigkeit`, `kopfweh`. `temperatur` in °C, `schweregrad` 1–3.

## `garmin/YYYY-MM-DD.json` (schreibt Claude)

Felder ohne Wert weglassen. `datum` ist der Tag, zu dem die Werte gehören. Schlaf und HRV gehören zur Nacht, die an diesem Tag endet.

```json
{
  "datum": "2026-11-02",
  "schemaVersion": 1,
  "erstelltAm": "2026-11-03T06:45:00+01:00",
  "schlaf": { "dauerMin": 452, "score": 81 },
  "hrv": { "nachtMittelMs": 62, "status": "balanced" },
  "ruhepuls": 48,
  "stress": { "durchschnitt": 27 },
  "bodyBattery": { "hoch": 92, "tief": 24 },
  "aktivitaeten": [
    { "sportart": "cycling", "dauerMin": 95, "distanzKm": 42.3, "trainingsbelastung": 118 }
  ]
}
```

Tage ohne Sport: `"aktivitaeten": []`. Fehlt das Feld, ist nicht bekannt, ob Sport stattfand.

Die App leitet daraus die Körper-Belastung ab: Summe der Trainingsbelastung unter 75 leicht aktiv, unter 200 moderat, unter 400 hart, ab 400 sehr viel Sport. Ohne Belastungswert zählt die Dauer (unter 45, 120, 210 Minuten).

## `reports/YYYY-Www.json` + `.md` (schreibt Claude)

```json
{
  "woche": "2026-W45",
  "schemaVersion": 1,
  "erstelltAm": "2026-11-08T17:00:00+01:00",
  "zeitraum": { "von": "2026-11-02", "bis": "2026-11-08" },
  "erfassteTage": 7,
  "kernaussagen": ["Kurzer, konkreter Satz mit Zahl"],
  "zeitreihen": [
    { "id": "schlaf", "titel": "Schlaf", "einheit": "h", "punkte": [{ "datum": "2026-11-02", "wert": 7.5 }] }
  ],
  "korrelationen": [
    {
      "faktor": "alkohol-vorabend",
      "titel": "Alkohol am Vorabend",
      "risiko": 1.8,
      "nMit": 6,
      "nOhne": 22,
      "einschaetzung": "moderat",
      "kommentar": "Kopfweh an 3 von 6 Tagen nach Alkohol, sonst an 6 von 22"
    }
  ]
}
```

- `kernaussagen`: 3 bis 5 Sätze, nur belegbare Aussagen.
- `zeitreihen`: Eine Reihe pro Grösse, `wert` darf `null` sein. Üblich: `schlaf`, `hrv`, `stress`, `kopfBelastung`, `koerperBelastung`, `befinden`, `kopfweh`.
- `korrelationen`: `risiko` ist die Kopfweh-Rate mit Faktor geteilt durch die Rate ohne Faktor, über mindestens 4 Wochen. `nMit`, `nOhne`: Anzahl Tage je Gruppe. Bei weniger als 5 Tagen in einer Gruppe: `risiko: null`, `einschaetzung: "zu-wenig-daten"`.
- `einschaetzung`: `zu-wenig-daten`, `schwach`, `moderat`, `deutlich`.
- Zusammenhänge sind keine Ursachen und keine Diagnose. Das gehört auch so in die Formulierung.

Die `.md`-Datei enthält denselben Bericht als lesbaren Text.
