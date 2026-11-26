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
let grund = null;      // Grundumsatz laut Garmin (kcal/Tag), null = Schätzung der Uhr
let einst = null;      // Einstellungen der Uhr-App aus dem Formular ({…, felder, felderStand}) oder null
let einstStand = 0;    // Zeitpunkt der letzten Änderung (Sekunden) – die Uhr übernimmt nur einen neuen Stand
let neuZeigen = () => {};

// Tageswerte (gebündelt, kurz nach einer Änderung) an die Android-App
export function senden() {
  if (!aktiv()) return;
  clearTimeout(zeitgeber);
  zeitgeber = setTimeout(jetztSenden, 300);
}

function jetztSenden() {
  if (!aktiv()) return;
  const daten = L.uhrDaten(S.alleMitGeloeschten());
  if (grund) daten.grund = grund;
  if (einst && einstStand) { daten.einst = einst; daten.einstStand = einstStand; }
  const text = JSON.stringify(daten);
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

// Grundumsatz laut Garmin: gültig 800–4000 kcal, sonst null (= die Uhr schätzt selbst)
export function grundPruefen(wert) {
  const g = Math.round(Number(wert));
  return Number.isFinite(g) && g >= 800 && g <= 4000 ? g : null;
}

export async function grundLaden() {
  const e = (await S.einstellung("uhr")) || {};
  grund = grundPruefen(e.grund);
  einst = e.einst && typeof e.einst === "object" ? e.einst : null;
  einstStand = Number(e.einstStand) || 0;
  // Seit 26.11.2026 vier Freigaben: alte Einstellungen (drei) einmal auf 10:00 / 12:00 / 16:00 / 18:30 umstellen
  if (einst && einst.e4zeit === undefined) {
    einst = { ...einst, e1zeit: "10:00", e1anteil: 20, e2zeit: "12:00", e2anteil: 30, e3zeit: "16:00", e3anteil: 15,
      e4zeit: "18:30", e4anteil: 35 };
    einstStand = Math.floor(Date.now() / 1000);
    await S.einstellung("uhr", { grund, einst, einstStand });
  }
  return grund;
}

async function uhrSpeichern() {
  await S.einstellung("uhr", { grund, einst, einstStand });
  zuletzt = "";
  senden();
}

export async function grundSetzen(g) {
  grund = grundPruefen(g);
  await uhrSpeichern();
  return grund;
}

// Gespeicherte Einstellungen der Uhr-App (oder null)
export const einstellungen = () => einst;

// Neue Einstellungen (geprüft, aus uhreinst.js pruefen) speichern und an die Uhr geben.
// felderStand ändert sich nur, wenn sich die Ziffernblatt-Felder ändern (sonst gilt das Menü der Uhr weiter).
export async function einstellungenSetzen(werte) {
  const jetzt = Math.floor(Date.now() / 1000);
  const felderStand = einst && einst.felder === werte.felder && einst.felderStand ? einst.felderStand : jetzt;
  einst = { ...werte, felderStand };
  einstStand = jetzt;
  await uhrSpeichern();
  return einst;
}

// Einstellungen, die die Uhr zuletzt als geltend gemeldet hat (oder null)
export function einstellungenDerUhr() {
  if (!aktiv() || !bruecke().uhrEinstellungen) return null;
  try { return JSON.parse(bruecke().uhrEinstellungen() || "null"); } catch { return null; }
}

// Letztes Gewicht, das die Uhr gemeldet hat: { gramm, zeit } oder null
export function gewicht() {
  if (!aktiv() || !bruecke().gewicht) return null;
  try { return JSON.parse(bruecke().gewicht() || "null"); } catch { return null; }
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
  grundLaden().catch(() => null).then(() => abholen()).then(() => { zuletzt = ""; senden(); });
}
