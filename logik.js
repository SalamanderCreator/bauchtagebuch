// Reine Rechenlogik des Bauchtagebuchs (ohne Oberfläche, ohne Speicher).

export const TYPEN = ["essen", "trinken", "symptom", "stuhl"];
export const TYP_NAME = { essen: "Essen", trinken: "Trinken", symptom: "Symptom", stuhl: "Stuhlgang" };

export const MAHLZEITEN = ["Frühstück", "Vormittag", "Mittagessen", "Nachmittag", "Abendessen", "Spät / Nacht"];
// Ohne Uhrzeit gilt für Sortierung und Auswertung diese Zeit der Mahlzeit
export const MAHLZEIT_ZEIT = {
  "Frühstück": "08:00", "Vormittag": "10:30", "Mittagessen": "12:30",
  "Nachmittag": "15:30", "Abendessen": "19:00", "Spät / Nacht": "22:00",
};

export const SYMPTOME = ["Blähungen", "Bauchschmerzen", "Krämpfe", "Völlegefühl", "Übelkeit",
  "Sodbrennen", "Kopfschmerzen", "Müdigkeit", "Hautreaktion", "Sonstiges"];

export const BRISTOL = {
  1: ["harte Kügelchen", "Verstopfung"],
  2: ["klumpig und hart", "leichte Verstopfung"],
  3: ["geformt, rissig", "normal"],
  4: ["glatt und weich", "normal"],
  5: ["weiche Stücke", "weich"],
  6: ["breiig", "Durchfall"],
  7: ["flüssig", "starker Durchfall"],
};
// Schwere eines auffälligen Stuhlgangs (für Beschwerden)
export const STUHL_SCHWERE = { 1: 3, 2: 2, 6: 3, 7: 4 };

// Beschwerden-Fenster nach dem Essen
export const FENSTER_VON_MIN = 20;
export const FENSTER_BIS_MIN = 8 * 60;

// ------------------------------------------------------------------ Datum und Zeit

export function heute() {
  return datumText(new Date());
}

export function datumText(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function jetztZeit() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function tageVerschieben(datum, n) {
  const [j, m, t] = datum.split("-").map(Number);
  return datumText(new Date(j, m - 1, t + n, 12));
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const WT_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function wochentag(datum) {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(j, m - 1, t, 12).getDay();
}

export function tagTitel(datum) {
  const h = heute();
  if (datum === h) return "Heute";
  if (datum === tageVerschieben(h, -1)) return "Gestern";
  const [j, m, t] = datum.split("-");
  return `${WOCHENTAGE[wochentag(datum)]}, ${Number(t)}.${Number(m)}.${j === h.slice(0, 4) ? "" : j}`;
}

// Zeit eines Eintrags für Sortierung/Auswertung ("HH:MM"), mit Ersatz über die Mahlzeit
export function wirksameZeit(e) {
  if (e.zeit) return e.zeit;
  if (e.mahlzeit && MAHLZEIT_ZEIT[e.mahlzeit]) return MAHLZEIT_ZEIT[e.mahlzeit];
  return "12:00";
}

// Minuten seit 1970 (lokal) für Abstände über Mitternacht hinweg
export function zeitpunkt(e) {
  const [j, m, t] = e.datum.split("-").map(Number);
  const [h, mi] = wirksameZeit(e).split(":").map(Number);
  return new Date(j, m - 1, t, h, mi).getTime() / 60000;
}

export function sortieren(eintraege) {
  return [...eintraege].sort((a, b) => wirksameZeit(a).localeCompare(wirksameZeit(b))
    || (a.erstellt || "").localeCompare(b.erstellt || ""));
}

// ------------------------------------------------------------------ Einträge

export function neueId() {
  const z = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(20));
  for (const b of r) s += z[b % z.length];
  return s;
}

export function istEssen(e) {
  return e.typ === "essen" || e.typ === "trinken";
}

// Beschwerde-Schwere eines Eintrags (0 = keine)
export function schwere(e) {
  if (e.typ === "symptom") return Number(e.staerke) || 3;
  if (e.typ === "stuhl" && !e.kein && STUHL_SCHWERE[e.bristol]) return STUHL_SCHWERE[e.bristol];
  return 0;
}

export function auffaellig(e) {
  return e.typ === "symptom" || (e.typ === "stuhl" && !!STUHL_SCHWERE[e.bristol]);
}

// Tagessumme: {kcal, geschaetzt (Schätzungen enthalten), fehlen (Einträge ohne kcal)}
export function tagesSumme(eintraege) {
  let kcal = 0, geschaetzt = false, fehlen = 0, anzahl = 0;
  for (const e of eintraege) {
    if (!istEssen(e)) continue;
    anzahl++;
    if (typeof e.kcal === "number") {
      kcal += e.kcal;
      if (e.kcalQuelle !== "eigene") geschaetzt = true;
    } else {
      fehlen++;
    }
  }
  return { kcal, geschaetzt, fehlen, anzahl };
}

export function kTausend(kcal) {
  if (!kcal) return "";
  return (Math.round(kcal / 100) / 10).toLocaleString("de-DE") + "k";
}

// ------------------------------------------------------------------ Zutaten

const EINHEIT = "(?:g|kg|mg|ml|l|cl|dl|stk\\.?|stück|scheiben?|el|tl|prise|pck\\.?|packung(?:en)?|dose|becher|glas|tasse)";
const MENGE_RE = new RegExp(`(^|\\s)(?:ca\\.?\\s*)?\\d+(?:[.,]\\d+)?\\s*${EINHEIT}(?=\\s|$|[.,])`, "gi");
const BRUCH_VON_RE = /^\s*\d+\s*\/\s*\d+\s*(?:von|vom|der|des)?\s*/i;
const ZAHL_VORN_RE = /^\s*(?:ca\.?\s*)?(?:\d+(?:[.,]\d+)?|ein(?:e|en|er)?|zwei|drei|halbe?n?)\s+/i;
const LEER_VORN_RE = /^\s*(?:ca\.?|etwa|eine?n?|tuben?|dosen?|gläser|glas|becher|packung(?:en)?|pck\.?|prisen?|handvoll|hand voll|scheiben?|stücke?|große?[nrs]?|groß|kleine?[nrs]?|kl\.|halbe?[nrs]?|ganze?[nrs]?|viertel|bisschen|etwas|wenig|viel)\s+/i;
const LADEN_RE =/\b(?:vom|von|aus dem|aus der|beim|bei)\s+(?:aldi|lidl|rewe|edeka|netto|penny|kaufland|dm|rossmann|bäcker|metzger|kühlregal|kühregal|tiefkühlregal|markt|supermarkt|laden)\b/gi;

// Klammern auf oberster Ebene finden: {aussen, gruppen[]}
function klammernTrennen(text) {
  let tiefe = 0, aussen = "", gruppe = "";
  const gruppen = [];
  for (const z of text) {
    if (z === "(") {
      if (tiefe > 0) gruppe += z;
      tiefe++;
    } else if (z === ")" && tiefe > 0) {
      tiefe--;
      if (tiefe === 0) { gruppen.push(gruppe); gruppe = ""; aussen += " "; } else gruppe += z;
    } else if (tiefe > 0) {
      gruppe += z;
    } else {
      aussen += z;
    }
  }
  if (gruppe) aussen += " " + gruppe; // nicht geschlossene Klammer: Inhalt als normaler Text
  return { aussen, gruppen };
}

function teilSaeubern(t) {
  let s = t.replace(LADEN_RE, " ").replace(BRUCH_VON_RE, "")
    // zusammengeschrieben wie "2ELRapsöl" oder "200gKäse"
    .replace(/\d+(?:[.,]\d+)?\s*(?:EL|TL|El|Tl|el|tl|kg|g|ml|l)(?=[A-ZÄÖÜ])/g, " ")
    .replace(MENGE_RE, " ");
  s = s.replace(ZAHL_VORN_RE, "").replace(/\d+\s*(?=[a-zäöüß])/gi, "");
  // Mengen- und Größenwörter am Anfang ("Tube Tomatenmark", "kleine Tomaten", "handvoll Rucola")
  let vorher;
  do {
    vorher = s;
    s = s.replace(LEER_VORN_RE, "");
  } while (s !== vorher);
  s = s.replace(/[.:!?"„“]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// Text an Trennern zerlegen, aber nur außerhalb von Klammern (, ; + Zeilenumbruch "und" "mit")
function aufObersterEbeneTeilen(text) {
  const teile = [];
  let tiefe = 0, akt = "", i = 0;
  while (i < text.length) {
    const z = text[i];
    if (z === "(") tiefe++;
    if (z === ")" && tiefe > 0) tiefe--;
    if (tiefe === 0) {
      if (",;+\n".includes(z)) { teile.push(akt); akt = ""; i++; continue; }
      const wort = text.slice(i).match(/^\s+(?:und|mit)\s+/i);
      if (wort) { teile.push(akt); akt = ""; i += wort[0].length; continue; }
    }
    akt += z;
    i++;
  }
  teile.push(akt);
  return teile;
}

const IST_LISTE = /[,;]|\sund\s/i;

// Zutaten eines Essens-Eintrags in Originalschreibweise (Schlüssel = klein geschrieben).
// "Name (Zutat, Zutat …)" = Gericht: es zählen nur die Zutaten in der Klammer, nicht der Name.
// Klammer ohne Liste ("Milchmäuse (Aldi)") = Notiz: es zählt der Name, die Klammer nicht.
export function zutaten(text) {
  const erg = [];
  for (const teil of aufObersterEbeneTeilen(text || "")) {
    const { aussen, gruppen } = klammernTrennen(teil);
    const listen = gruppen.filter((g) => IST_LISTE.test(g));
    for (const g of listen) erg.push(...zutaten(g));
    if (listen.length) continue;   // Gerichtname weglassen
    const s = teilSaeubern(aussen);
    if (s.length >= 2 && /[a-zäöüß]/i.test(s)) erg.push(s);
  }
  // doppelte entfernen (klein geschrieben)
  const gesehen = new Set();
  return erg.filter((z) => {
    const k = z.toLowerCase();
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

// Zutaten eines Eintrags: bei Rezepten die gespeicherte Zutatenliste, sonst aus dem Text
export function essZutaten(e) {
  if (Array.isArray(e.zutaten) && e.zutaten.length) return e.zutaten;
  return zutaten(e.text);
}

// ------------------------------------------------------------------ Rezepte

export function normal(s) {
  return String(s || "").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Rezepte, deren Name alle eingegebenen Wörter enthält (Wortanfang zählt mehr), beste zuerst
export function rezeptSuche(rezepte, eingabe, max = 5) {
  const text = String(eingabe || "");
  if (text.includes(",") || normal(text).length < 3) return [];
  const woerter = normal(text).split(" ").filter((w) => w.length >= 2);
  if (!woerter.length) return [];
  const treffer = [];
  for (const r of rezepte) {
    const n = normal(r.name);
    if (!woerter.every((w) => n.includes(w))) continue;
    const nw = n.split(" ");
    let punkte = n.startsWith(woerter[0]) ? 3 : 0;
    for (const w of woerter) if (nw.some((x) => x.startsWith(w))) punkte += 2;
    if (n === normal(text)) punkte += 10;
    treffer.push({ r, punkte, laenge: n.length });
  }
  return treffer.sort((a, b) => b.punkte - a.punkte || a.laenge - b.laenge).slice(0, max).map((t) => t.r);
}

const ZAHLWORT = { halbe: 0.5, halb: 0.5, eine: 1, ein: 1, einer: 1, zwei: 2, drei: 3, viertel: 0.25, "½": 0.5, "¼": 0.25, "¾": 0.75 };

// Portionen aus dem Mengenfeld: leer = 1, "1,5", "1/2", "½ Portion", "2 Portionen". Andere Angaben → null
export function portionenLesen(menge) {
  const s = String(menge || "").trim().toLowerCase().replace(",", ".");
  if (!s) return 1;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*(?:portion(?:en)?|port\.?)?$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:portion(?:en)?|port\.?|teller|x)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^([a-z½¼¾]+)\s*(?:portion(?:en)?|port\.?|teller)?$/);
  if (m && ZAHLWORT[m[1]] !== undefined) return ZAHLWORT[m[1]];
  return null;
}

export function portionenText(p) {
  const z = Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100).replace(".", ",");
  return `${z} ${p === 1 ? "Portion" : "Portionen"}`;
}

// kcal für die eingetragene Menge eines Rezepts (null, wenn das Rezept keine kcal hat oder die Menge unklar ist)
export function rezeptKcal(rezept, menge) {
  const p = portionenLesen(menge);
  if (!rezept || typeof rezept.kcal !== "number" || p === null) return null;
  return Math.round(rezept.kcal * p);
}

// Kochplan-Einträge eines Tags mit ihrem Rezept aus der Rezeptliste (Varianten über die Nummer).
// Rezepte, die (noch) nicht in der Liste sind, fallen weg; jedes Rezept nur einmal.
export function geplantAm(geplant, rezepte, datum) {
  const nachId = new Map(rezepte.map((r) => [r.id, r]));
  const erg = [], gesehen = new Set();
  for (const p of geplant || []) {
    if (p.datum !== datum) continue;
    let r = nachId.get(p.rezeptId);
    if (r && Number.isInteger(p.variante) && r.varianten && r.varianten[p.variante]) {
      r = nachId.get(r.varianten[p.variante]) || r;
    }
    if (!r || gesehen.has(r.id)) continue;
    gesehen.add(r.id);
    erg.push({ rezept: r, rest: !!p.rest, portionen: p.portionen });
  }
  return erg;
}

// ------------------------------------------------------------------ Muster

// Für jede Zutat: wie oft gegessen, wie oft 20 min–8 h danach eine Beschwerde
export function muster(eintraege) {
  const essen = eintraege.filter(istEssen);
  const beschwerden = eintraege.filter((e) => schwere(e) > 0).map((e) => zeitpunkt(e));
  const stat = new Map();
  for (const e of essen) {
    const t0 = zeitpunkt(e);
    const danach = beschwerden.some((b) => b - t0 >= FENSTER_VON_MIN && b - t0 <= FENSTER_BIS_MIN);
    for (const z of essZutaten(e)) {
      const k = z.toLowerCase();
      const s = stat.get(k) || { zutat: z, gegessen: 0, danach: 0 };
      s.gegessen++;
      if (danach) s.danach++;
      stat.set(k, s);
    }
  }
  return [...stat.values()]
    .filter((s) => s.gegessen >= 2)
    .map((s) => ({ ...s, anteil: s.danach / s.gegessen }))
    .sort((a, b) => b.anteil - a.anteil || b.gegessen - a.gegessen || a.zutat.localeCompare(b.zutat));
}

// ------------------------------------------------------------------ Vorschläge

// Frühere Einträge eines Typs, gruppiert nach Text: [{text, anzahl, juengster}]
function frueherGruppiert(eintraege, typ) {
  const m = new Map();
  for (const e of eintraege) {
    if (e.typ !== typ || !e.text) continue;
    const k = e.text.trim().toLowerCase();
    const g = m.get(k) || { text: e.text.trim(), anzahl: 0, juengster: e };
    g.anzahl++;
    if ((e.datum + wirksameZeit(e)) > (g.juengster.datum + wirksameZeit(g.juengster))) g.juengster = e;
    m.set(k, g);
  }
  return [...m.values()];
}

export function vorschlaege(eintraege, typ, eingabe) {
  const gruppen = frueherGruppiert(eintraege, typ);
  const text = (eingabe || "").trim();
  if (!text) {
    return {
      eintraege: gruppen.sort((a, b) => b.anzahl - a.anzahl).slice(0, 6),
      zutaten: [],
    };
  }
  const klein = text.toLowerCase();
  let frueher = [];
  if (!text.includes(",")) {
    frueher = gruppen
      .filter((g) => g.text.toLowerCase().includes(klein) && g.text.toLowerCase() !== klein)
      .sort((a, b) => (b.text.toLowerCase().startsWith(klein) - a.text.toLowerCase().startsWith(klein))
        || b.anzahl - a.anzahl)
      .slice(0, 3);
  }
  // Zutaten zum Teil nach dem letzten Komma
  const teil = (eingabe.split(",").pop() || "").trim().toLowerCase();
  let zut = [];
  if (teil.length >= 1) {
    const schon = new Set(zutaten(eingabe).map((z) => z.toLowerCase()));
    const zaehler = new Map();
    for (const e of eintraege) {
      if (!istEssen(e)) continue;
      for (const z of essZutaten(e)) {
        const k = z.toLowerCase();
        const v = zaehler.get(k) || { zutat: z, anzahl: 0 };
        v.anzahl++;
        zaehler.set(k, v);
      }
    }
    const wortAnfang = (k) => k.startsWith(teil) || k.split(/\s+/).some((w) => w.startsWith(teil));
    const alsEintrag = new Set(frueher.map((g) => g.text.toLowerCase()));
    zut = [...zaehler.entries()]
      .filter(([k]) => k.includes(teil) && k !== teil && !schon.has(k) && !alsEintrag.has(k))
      .sort(([ka, a], [kb, b]) => (wortAnfang(kb) - wortAnfang(ka)) || b.anzahl - a.anzahl)
      .slice(0, 6)
      .map(([, v]) => v.zutat);
  }
  return { eintraege: frueher, zutaten: zut };
}

// ------------------------------------------------------------------ kcal aus dem Verlauf

// "300 g" → {wert: 300, einheit: "g"}; Getränke: Zahl ohne Einheit = ml
export function mengeLesen(menge, typ) {
  if (!menge) return null;
  const m = String(menge).trim().toLowerCase().replace(",", ".")
    .match(/^(\d+(?:\.\d+)?)\s*([a-zäöü]*)/);
  if (!m) return null;
  let wert = parseFloat(m[1]);
  let einheit = m[2] || (typ === "trinken" ? (wert <= 3 ? "l" : "ml") : "stück");
  if (einheit === "kg") { wert *= 1000; einheit = "g"; }
  if (einheit === "l") { wert *= 1000; einheit = "ml"; }
  if (einheit === "cl") { wert *= 10; einheit = "ml"; }
  if (["stk", "stk.", "st", "stück", "stueck"].includes(einheit)) einheit = "stück";
  return { wert, einheit };
}

// kcal aus früheren Einträgen mit demselben Text (gleiche Menge oder umrechenbar), sonst null
export function kcalAusVerlauf(eintraege, eintrag) {
  const k = (eintrag.text || "").trim().toLowerCase();
  if (!k) return null;
  const frueher = eintraege
    .filter((e) => e.id !== eintrag.id && e.typ === eintrag.typ && typeof e.kcal === "number"
      && e.kcalQuelle !== "veraltet" && (e.text || "").trim().toLowerCase() === k)
    .sort((a, b) => (b.datum + wirksameZeit(b)).localeCompare(a.datum + wirksameZeit(a)));
  if (!frueher.length) return null;
  const mengeNeu = (eintrag.menge || "").trim().toLowerCase();
  // 1. gleiche Menge (auch beide leer)
  const gleich = frueher.find((e) => (e.menge || "").trim().toLowerCase() === mengeNeu);
  if (gleich) return gleich.kcal;
  // 2. umrechenbare Menge
  const neu = mengeLesen(eintrag.menge, eintrag.typ);
  if (neu) {
    for (const e of frueher) {
      const alt = mengeLesen(e.menge, e.typ);
      if (alt && alt.einheit === neu.einheit && alt.wert > 0) {
        return Math.round(e.kcal * neu.wert / alt.wert / 5) * 5;
      }
    }
  }
  // 3. 0 kcal (Wasser) gilt für jede Menge
  if (frueher[0].kcal === 0) return 0;
  return null;
}

// ------------------------------------------------------------------ Export

export const CSV_SPALTEN = ["id", "datum", "zeit", "typ", "text", "menge", "mahlzeit", "kcal", "kcalQuelle",
  "bristol", "kein", "symptome", "staerke", "notiz", "erstellt", "geaendert", "zutaten"];

export function csv(eintraege) {
  const feld = (v) => {
    if (v === undefined || v === null) return "";
    if (Array.isArray(v)) v = v.join(", ");
    if (v === true) v = "True";
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const zeilen = [CSV_SPALTEN.join(";")];
  for (const e of eintraege) zeilen.push(CSV_SPALTEN.map((s) => feld(e[s])).join(";"));
  return "﻿" + zeilen.join("\r\n") + "\r\n";
}

// Markdown für eine Auswertung durch eine KI (Claude, ChatGPT …): Anleitung + Daten + Muster
export function kiExport(eintraege, von, bis) {
  const tage = new Map();
  for (const e of eintraege) {
    if (e.datum < von || e.datum > bis) continue;
    if (!tage.has(e.datum)) tage.set(e.datum, []);
    tage.get(e.datum).push(e);
  }
  const daten = [...tage.keys()].sort();
  const z = [];
  z.push(`# Bauchtagebuch ${von} bis ${bis}`);
  z.push("");
  z.push("## Auftrag an die KI");
  z.push("");
  z.push("Ich führe ein Ernährungs- und Beschwerdetagebuch, um eine mögliche Lebensmittelunverträglichkeit zu " +
    "finden und meine Kalorienaufnahme zu sehen. Bitte werte die Daten unten aus:");
  z.push("");
  z.push("1. Welche Lebensmittel oder Zutaten tauchen auffällig oft 20 Minuten bis 8 Stunden vor Beschwerden " +
    "(Symptome, Stuhlgang Bristol 1–2 oder 6–7) auf? Berücksichtige auch, wie oft sie **ohne** Beschwerden " +
    "gegessen wurden.");
  z.push("2. Gibt es Muster nach Tageszeit, Mahlzeit, Menge, Kombination von Lebensmitteln oder den Notizen " +
    "(z. B. Stress, auswärts gegessen)?");
  z.push("3. Welche Verdächtigen lohnt es sich gezielt zu testen (z. B. Auslassversuch), und wie gehe ich dabei vor?");
  z.push("4. Kalorien: Wie sieht meine durchschnittliche Aufnahme aus, an welchen Tagen und bei welchen " +
    "Lebensmitteln ist sie hoch? Die meisten kcal-Werte sind KI-Schätzungen (Kennzeichen ≈).");
  z.push("5. Was sollte ich künftig genauer notieren, damit die Auswertung aussagekräftiger wird?");
  z.push("");
  z.push("Bitte vorsichtig formulieren: Das sind Hinweise, keine Diagnose. Weise darauf hin, wenn die Datenmenge " +
    "für eine Aussage zu klein ist.");
  z.push("");
  z.push("## Legende");
  z.push("");
  z.push("- Zeilenformat: `Uhrzeit · Art · Inhalt · Menge · kcal · Notiz`; „ca. 12:30“ = nur Mahlzeit angegeben.");
  z.push("- kcal: ohne Zeichen = selbst eingetragen, ≈ = geschätzt, ? = fehlt.");
  z.push("- Symptom-Stärke 1 (kaum spürbar) bis 5 (sehr stark).");
  z.push("- Stuhlgang nach Bristol-Skala: 1 harte Kügelchen, 2 klumpig und hart, 3 geformt und rissig (normal), " +
    "4 glatt und weich (normal), 5 weiche Stücke, 6 breiig (Durchfall), 7 flüssig.");
  z.push("- In Klammern stehen oft Rezepte: „1/4 von Eintopf (Zutaten …)“ = ein Viertel des ganzen Rezepts.");
  z.push("- „(Rezept; Zutaten: …)“ = Gericht aus der Rezeptliste mit allen Zutaten (ohne Salz, Pfeffer, Wasser); " +
    "die Menge ist dann die Zahl der Portionen.");
  z.push("");
  z.push("## Tage");
  for (const d of daten) {
    const liste = sortieren(tage.get(d));
    const s = tagesSumme(liste);
    z.push("");
    z.push(`### ${WT_KURZ[wochentag(d)]} ${d} – ${s.geschaetzt ? "≈ " : ""}${s.kcal} kcal` +
      (s.fehlen ? ` (+ ${s.fehlen} ohne kcal)` : ""));
    z.push("");
    for (const e of liste) {
      const zeit = e.zeit || (e.mahlzeit ? `ca. ${wirksameZeit(e)}` : "–");
      const teile = [zeit];
      if (istEssen(e)) {
        teile.push(TYP_NAME[e.typ] + (e.mahlzeit ? ` (${e.mahlzeit})` : ""),
          e.zutaten && e.zutaten.length ? `${e.text} (Rezept; Zutaten: ${e.zutaten.join(", ")})` : e.text);
        if (e.menge) teile.push(e.menge);
        teile.push(typeof e.kcal === "number"
          ? `${e.kcalQuelle === "eigene" ? "" : "≈"}${e.kcal} kcal` : "? kcal");
      } else if (e.typ === "symptom") {
        teile.push("Symptom", `${(e.symptome || []).join(", ")}, Stärke ${e.staerke}`);
      } else if (e.kein) {
        teile.push("Stuhlgang", "kein Stuhlgang an diesem Tag");
      } else {
        teile.push("Stuhlgang", `Bristol ${e.bristol} (${(BRISTOL[e.bristol] || ["?"])[0]})`);
      }
      if (e.notiz) teile.push(`Notiz: ${e.notiz}`);
      z.push("- " + teile.join(" · "));
    }
  }
  const m = muster(eintraege.filter((e) => e.datum >= von && e.datum <= bis));
  z.push("");
  z.push("## Vorberechnete Häufung (vom Programm, nur als Ausgangspunkt)");
  z.push("");
  z.push("Je Zutat (mindestens 2× gegessen): wie oft gegessen, wie oft 20 min bis 8 h danach eine Beschwerde.");
  z.push("");
  z.push("| Zutat | gegessen | danach Beschwerde | Anteil |");
  z.push("|---|---|---|---|");
  for (const s of m.slice(0, 40)) {
    z.push(`| ${s.zutat} | ${s.gegessen} | ${s.danach} | ${Math.round(s.anteil * 100)} % |`);
  }
  return z.join("\n") + "\n";
}

// ------------------------------------------------------------------ Garmin-Uhr

// Menge eines Getränks in ml (wie im Google-Script mlLesen). Eigenes Feld "ml" geht vor; sonst Freitext:
// "500" / "300" = ml, Zahl bis 3 = Liter ("1", "0,75"), "1l", "0,5 l", "33 cl", "2 Gläser", "1 Flasche".
// Leer oder unlesbar = ein Glas (250 ml).
export function mlLesen(e) {
  if (typeof e.ml === "number" && e.ml >= 0) return e.ml;
  const s = String(e.menge || "").trim().toLowerCase().replace(",", ".");
  if (!s) return 250;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|liter|glas|gläser|glaeser|tasse[n]?|becher|flasche[n]?|dose[n]?)?/);
  if (!m) return 250;
  const wert = parseFloat(m[1]), einheit = m[2] || "";
  if (einheit === "ml") return wert;
  if (einheit === "cl") return wert * 10;
  if (einheit === "dl") return wert * 100;
  if (einheit === "l" || einheit === "liter") return wert * 1000;
  if (/^flasche/.test(einheit)) return wert * 500;
  if (/^dose/.test(einheit)) return wert * 330;
  if (einheit) return wert * 250;                 // Glas, Tasse, Becher
  return wert <= 3 ? wert * 1000 : wert;          // reine Zahl
}

// Tageswerte für die Uhr wie im Google-Script (uhrDaten): {datum, kcal, woche: [{d, k}] × 7, ml,
// letzterDrink, stand}. alle = Einträge einschließlich gelöschter. Zusätzlich für die Android-App:
// uhrIds = IDs der Uhr-Einträge dieser 7 Tage, die schon enthalten sind (dort nicht doppelt zählen).
export function uhrDaten(alle, jetzt = new Date()) {
  const heute = datumText(jetzt);
  const tage = [];
  for (let t = 6; t >= 0; t--) tage.push(tageVerschieben(heute, -t));
  const proTag = {};
  let stand = 0, ml = 0, letzter = null;
  const uhrIds = [];
  for (const e of alle) {
    const g = Date.parse(e.geaendert || "");
    if (g > stand * 1000) stand = Math.floor(g / 1000);
    if (e.geloescht || (e.typ !== "essen" && e.typ !== "trinken")) continue;
    if (typeof e.kcal === "number") proTag[e.datum] = (proTag[e.datum] || 0) + Math.round(e.kcal);
    if (String(e.id).startsWith("uhr-") && tage.includes(e.datum)) uhrIds.push(e.id);
    if (e.typ === "trinken" && e.datum === heute) {
      ml += mlLesen(e);
      const zeit = e.zeit || MAHLZEIT_ZEIT[e.mahlzeit] || "";
      if (zeit && (!letzter || zeit > letzter)) letzter = zeit;
    }
  }
  const woche = tage.map((d) => ({ d, k: Object.prototype.hasOwnProperty.call(proTag, d) ? proTag[d] : null }));
  return { datum: heute, kcal: proTag[heute] || 0, woche, ml: Math.round(ml), letzterDrink: letzter, stand, uhrIds };
}

// Eintrag von der Uhr (über die Android-App, schon vollständig wie im Google-Script angelegt) übernehmen?
// Gibt den zu speichernden Eintrag zurück oder null (schon da / nichts zu tun).
export function uhrEintragUebernehmen(vorhanden, e) {
  if (!e || !/^uhr-[0-9a-z-]{4,40}$/.test(String(e.id))) return null;
  if (e.geloescht) {
    if (vorhanden && vorhanden.geloescht) return null;
    if (vorhanden) return { ...vorhanden, geloescht: e.geloescht, geaendert: e.geaendert, sync: false };
    return { ...e, sync: false };      // nie hier gewesen: gelöscht merken, damit Google es auch löscht
  }
  if (vorhanden) return null;          // schon da (z. B. über Google): nichts doppelt
  return { ...e, sync: false };
}
