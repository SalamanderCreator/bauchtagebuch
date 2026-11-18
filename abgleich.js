// Abgleich mit Google Apps Script (Schritt 2).
// Jedes Gerät sendet seine offenen Änderungen und holt alles, was seit dem letzten Abgleich
// beim Server angekommen ist ("seit" = Serverzeit, damit falsch gehende Uhren nicht stören).
import * as S from "./speicher.js";

let laeuft = false;
let nochmal = false;
let zeitgeber = null;
const hoerer = new Set();

export async function einstellungen() {
  return (await S.einstellung("abgleich")) || { url: "", schluessel: "", seit: "", zuletzt: "" };
}

export async function einstellungenSetzen(url, schluessel) {
  const alt = await einstellungen();
  const neu = { ...alt, url: url.trim(), schluessel: schluessel.trim() };
  // andere URL oder anderer Schlüssel → beim nächsten Mal alles neu holen
  if (neu.url !== alt.url || neu.schluessel !== alt.schluessel) { neu.seit = ""; neu.seitRezepte = ""; }
  await S.einstellung("abgleich", neu);
  return neu;
}

export function beiAenderung(fn) {
  hoerer.add(fn);
}

function melden(zustand) {
  for (const fn of hoerer) fn(zustand);
}

async function senden(url, daten) {
  const antwort = await fetch(url, {
    method: "POST",
    // text/plain: keine Vorab-Anfrage (CORS), die Apps Script nicht beantworten kann
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(daten),
  });
  if (!antwort.ok) throw new Error(`Server antwortet mit ${antwort.status}`);
  const d = await antwort.json();
  if (d.fehler) throw new Error(d.fehler);
  return d;
}

// Einmal abgleichen. Gibt {ok, gesendet, empfangen} zurück; Fehler werden gemeldet, nicht geworfen.
export async function abgleichen() {
  if (laeuft) { nochmal = true; return null; }
  const e = await einstellungen();
  if (!e.url || !e.schluessel) {
    melden({ art: "aus", offen: S.ausstehend().length });
    return null;
  }
  if (!navigator.onLine) {
    melden({ art: "offline", offen: S.ausstehend().length });
    return null;
  }
  laeuft = true;
  melden({ art: "laeuft", offen: S.ausstehend().length });
  try {
    const ohneSync = (x) => {
      const { sync, ...rest } = x;
      return rest;
    };
    const gesendet = S.ausstehend().map(ohneSync);
    const rezGesendet = S.rezepteAusstehend().map(ohneSync);
    const d = await senden(e.url, {
      aktion: "sync", schluessel: e.schluessel, seit: e.seit, aenderungen: gesendet,
      rezepte: rezGesendet, seitRezepte: e.seitRezepte || "",
    });
    const empfangen = await S.abgleichAnwenden(gesendet, d.aenderungen || []);
    let rezepte = 0;
    const neu = { ...e, seit: d.jetzt, zuletzt: new Date().toISOString() };
    if (Array.isArray(d.rezepte)) {   // ältere Server-Fassung kennt keine Rezepte
      rezepte = await S.rezepteAbgleichAnwenden(rezGesendet, d.rezepte);
      neu.seitRezepte = d.jetztRezepte;
    }
    await S.einstellung("abgleich", neu);
    melden({ art: "ok", offen: S.ausstehend().length, gesendet: gesendet.length, empfangen, rezepte, zuletzt: new Date() });
    return { ok: true, gesendet: gesendet.length, empfangen, rezepte, rezepteGesendet: rezGesendet.length };
  } catch (err) {
    // TypeError = keine Verbindung (Funkloch, Flugmodus): Einträge bleiben offen und gehen später raus
    const offline = err instanceof TypeError;
    melden({ art: offline ? "offline" : "fehler", offen: S.ausstehend().length, text: err.message });
    return { ok: false, fehler: offline ? "keine Verbindung" : err.message };
  } finally {
    laeuft = false;
    if (nochmal) { nochmal = false; setTimeout(abgleichen, 200); }
  }
}

// Verbindung testen, ohne etwas zu ändern
export async function testen(url, schluessel) {
  return senden(url.trim(), { aktion: "test", schluessel: schluessel.trim() });
}

// HelloFresh-Rezept per Link: das Google-Script liest die Seite und speichert das Rezept
export async function rezeptLink(link) {
  const e = await einstellungen();
  if (!e.url || !e.schluessel) throw new Error("Erst den Abgleich mit Google einrichten.");
  const d = await senden(e.url, { aktion: "rezept_link", schluessel: e.schluessel, url: link.trim() });
  await S.rezepteUebernehmen([d.rezept], true);
  return d.rezept;
}

// Nach einer Änderung kurz warten (mehrere Änderungen in einem Rutsch), dann abgleichen
export function bald() {
  clearTimeout(zeitgeber);
  zeitgeber = setTimeout(abgleichen, 1500);
}

export function automatischStarten() {
  window.addEventListener("online", () => abgleichen());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) abgleichen(); });
  setInterval(() => { if (!document.hidden) abgleichen(); }, 5 * 60 * 1000);
  abgleichen();
}
