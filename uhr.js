// Verbindung zur Garmin-Uhr über die Android-App „Bauchtagebuch“ (Bluetooth, auch ohne Internet).
// Nur aktiv, wenn die Web-App in der Android-App läuft (dort gibt es window.BauchUhr); in Chrome und
// am PC passiert hier nichts.
//  - Nach jeder Änderung: Tageswerte an die Android-App, die sie sofort an die Uhr schickt.
//  - Einträge von der Uhr: holt die Android-App ab; sie werden hier als normale Einträge gespeichert
//    und wie alles andere mit Google abgeglichen (gleiche ID = nichts doppelt).
import * as L from "./logik.js";
import * as S from "./speicher.js";

const bruecke = () => window.BauchUhr;
export const aktiv = () => !!window.BauchUhr;

let zeitgeber = null;
let zuletzt = "";
let neuZeigen = () => {};

// Tageswerte (gebündelt, kurz nach einer Änderung) an die Android-App
export function senden() {
  if (!aktiv()) return;
  clearTimeout(zeitgeber);
  zeitgeber = setTimeout(jetztSenden, 300);
}

function jetztSenden() {
  if (!aktiv()) return;
  const text = JSON.stringify(L.uhrDaten(S.alleMitGeloeschten()));
  if (text === zuletzt) return;
  zuletzt = text;
  try { bruecke().werte(text); } catch (err) { console.warn("Uhr: Werte nicht übergeben", err); }
}

// Einträge von der Uhr abholen und speichern. Gibt die Anzahl neuer/geänderter Einträge zurück.
export async function abholen() {
  if (!aktiv()) return 0;
  let liste;
  try { liste = JSON.parse(bruecke().abholen() || "[]"); } catch { return 0; }
  if (!Array.isArray(liste) || !liste.length) return 0;
  const nachId = new Map(S.alleMitGeloeschten().map((e) => [e.id, e]));
  const neu = [];
  for (const e of liste) {
    const x = L.uhrEintragUebernehmen(nachId.get(e && e.id), e);
    if (x) neu.push(x);
  }
  if (neu.length) await S.uebernehmen(neu);
  // erst die neuen Tageswerte übergeben, dann die Einträge als übernommen melden
  zuletzt = "";
  jetztSenden();
  try { bruecke().uebernommen(JSON.stringify(liste.map((e) => e && e.id))); } catch { /* nächstes Mal */ }
  if (neu.length) neuZeigen(neu.length);
  return neu.length;
}

// Zugang zu Google für die Android-App (sie gibt Uhr-Einträge selbst weiter, auch wenn die App zu ist)
export function zugangMelden(e) {
  if (!aktiv() || !e) return;
  try { bruecke().zugang(e.url || "", e.schluessel || ""); } catch { /* ältere Android-App */ }
}

// Datei speichern (Export) über die Android-App, da dort Downloads aus der Seite nicht gehen
export function dateiSpeichern(name, inhalt, mime) {
  if (!aktiv() || !bruecke().dateiSpeichern) return false;
  return !!bruecke().dateiSpeichern(name, inhalt, mime);
}

export function statusOeffnen() {
  if (aktiv()) bruecke().statusOeffnen();
}

// Start: Rückruf fürs Neuzeichnen setzen, abholen, wenn die Android-App neue Einträge meldet
export function starten(beiNeuen) {
  if (!aktiv()) return;
  neuZeigen = beiNeuen;
  window.bauchUhrNeu = () => { abholen(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) abholen(); });
  abholen().then(() => { zuletzt = ""; senden(); });
}
