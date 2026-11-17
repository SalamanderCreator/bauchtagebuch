// Datenspeicher im Browser (IndexedDB). Alle Einträge werden zusätzlich im Speicher gehalten.
// Gelöschte Einträge bleiben mit "geloescht" (Zeitstempel) erhalten, damit der spätere Abgleich
// mit Google das Löschen weitergeben kann; sie werden nirgends angezeigt.

const DB_NAME = "bauchtagebuch";
const STORE = "eintraege";

let db = null;
let alle = [];   // inkl. gelöschter

function anfrage(req) {
  return new Promise((ok, fehler) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
}

export async function oeffnen() {
  db = await new Promise((ok, fehler) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains("einstellungen")) d.createObjectStore("einstellungen");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
  alle = await anfrage(db.transaction(STORE).objectStore(STORE).getAll());
  return eintraege();
}

// Sichtbare Einträge (ohne gelöschte)
export function eintraege() {
  return alle.filter((e) => !e.geloescht);
}

export function alleMitGeloeschten() {
  return alle;
}

export async function speichern(e) {
  e.geaendert = new Date().toISOString();
  e.sync = false;   // noch nicht an Google übertragen (Schritt 2)
  await anfrage(db.transaction(STORE, "readwrite").objectStore(STORE).put(e));
  const i = alle.findIndex((x) => x.id === e.id);
  if (i >= 0) alle[i] = e; else alle.push(e);
  return e;
}

export async function loeschen(id) {
  const e = alle.find((x) => x.id === id);
  if (!e) return;
  e.geloescht = new Date().toISOString();
  await speichern(e);
}

// Viele Einträge auf einmal übernehmen (Import). Vorhandene IDs werden ersetzt.
export async function uebernehmen(liste) {
  const tx = db.transaction(STORE, "readwrite");
  const st = tx.objectStore(STORE);
  for (const e of liste) st.put(e);
  await new Promise((ok, fehler) => { tx.oncomplete = ok; tx.onerror = () => fehler(tx.error); });
  const neu = new Map(alle.map((e) => [e.id, e]));
  for (const e of liste) neu.set(e.id, e);
  alle = [...neu.values()];
}

// ------------------------------------------------------------------ Abgleich

// Einträge (auch gelöschte), die noch nicht beim Server sind
export function ausstehend() {
  return alle.filter((e) => e.sync === false);
}

// Ergebnis eines Abgleichs übernehmen:
//  gesendet  = die übertragenen Einträge (Stand beim Senden) → als abgeglichen markieren,
//              sofern sie seitdem nicht erneut geändert wurden
//  empfangen = Einträge vom Server → übernehmen, außer die lokale Fassung ist neuer und noch offen
export async function abgleichAnwenden(gesendet, empfangen) {
  const tx = db.transaction(STORE, "readwrite");
  const st = tx.objectStore(STORE);
  const nachId = new Map(alle.map((e) => [e.id, e]));
  let geaendert = 0;
  for (const g of gesendet) {
    const lokal = nachId.get(g.id);
    if (lokal && lokal.geaendert === g.geaendert) {
      lokal.sync = true;
      st.put(lokal);
    }
  }
  for (const e of empfangen) {
    const lokal = nachId.get(e.id);
    if (lokal && lokal.sync === false && (lokal.geaendert || "") > (e.geaendert || "")) continue;
    if (lokal && lokal.geaendert === e.geaendert && !!lokal.geloescht === !!e.geloescht) continue;
    const neu = { ...e, sync: true };
    nachId.set(e.id, neu);
    st.put(neu);
    geaendert++;
  }
  await new Promise((ok, fehler) => { tx.oncomplete = ok; tx.onerror = () => fehler(tx.error); });
  alle = [...nachId.values()];
  return geaendert;
}

// Alles aus der Datenbank neu lesen (für die Import-Prüfung)
export async function neuLesen() {
  alle = await anfrage(db.transaction(STORE).objectStore(STORE).getAll());
  return eintraege();
}

export async function einstellung(name, wert) {
  const st = () => db.transaction("einstellungen", wert === undefined ? "readonly" : "readwrite")
    .objectStore("einstellungen");
  if (wert === undefined) return anfrage(st().get(name));
  return anfrage(st().put(wert, name));
}
