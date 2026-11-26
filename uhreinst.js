// Einstellungen der Uhr-App „Bauchtagebuch kcal“ (Glance) und der Felder des Ziffernblatts.
// Selbst aufgespielte Uhr-Apps haben keine Einstellungen in Garmin Connect – deshalb stellt man sie hier ein;
// die Android-App schickt sie an die Uhr. Bereiche wie in der Uhr-App (KcalRechnung.einstZahl …).

export const FELD_ARTEN = [
  [0, "Wetter"], [1, "Herzfrequenz"], [2, "Frei (kcal)"], [3, "Schritte zum Ausgleich"], [4, "Schritte"],
  [5, "Kalorien verbraucht"], [6, "Sonnenauf-/untergang"], [7, "Höhe"], [9, "Leer"],
];

const z = (id, text, std, min, max, einheit = "") => ({ id, art: "zahl", text, std, min, max, einheit });
const u = (id, text, std) => ({ id, art: "zeit", text, std });

export const GRUPPEN = [
  { titel: "Kalorienbudget", felder: [
    z("defizit", "Geplantes Defizit", 200, -1000, 1500, "kcal/Tag"),
    z("aktivfaktor", "Aktivfaktor (angerechneter Anteil der Aktivkalorien)", 70, 0, 150, "%"),
    u("e1zeit", "1. Freigabe ab", "10:00"), z("e1anteil", "1. Freigabe Anteil", 20, 0, 100, "%"),
    u("e2zeit", "2. Freigabe ab", "12:00"), z("e2anteil", "2. Freigabe Anteil", 30, 0, 100, "%"),
    u("e3zeit", "3. Freigabe ab", "16:00"), z("e3anteil", "3. Freigabe Anteil", 15, 0, 100, "%"),
    u("e4zeit", "4. Freigabe ab", "18:30"), z("e4anteil", "4. Freigabe Anteil", 35, 0, 100, "%"),
    z("rotab", "Rot ab (frei unter minus)", 200, 0, 2000, "kcal"),
  ] },
  { titel: "Trinken", felder: [
    z("trinkgrund", "Grundbedarf (0 = 32 ml je kg)", 0, 0, 8000, "ml/Tag"),
    z("schwitz", "Bewegung: ml je 100 Aktivkalorien", 100, 0, 300, "ml"),
    z("hitzeab", "Hitze-Zuschlag ab", 25, 10, 45, "°C"),
    z("hitzeprozent", "Hitze-Zuschlag je angefangene 3 °C", 10, 0, 50, "%"),
    z("hitzemax", "Hitze-Zuschlag höchstens", 50, 0, 200, "%"),
  ] },
  { titel: "Schlafenszeit", hinweis: "Die Uhr ruft dann nichts ab und erinnert nicht ans Trinken. Die Trinkmenge verteilt sich auf die Zeit dazwischen.", felder: [
    u("wachbis", "Schlafenszeit ab", "22:00"), u("wachvon", "Schlafenszeit bis", "06:00"),
  ] },
  { titel: "Trinkerinnerung", felder: [
    { id: "erinnerung", art: "schalter", text: "Trinkerinnerung an", std: true },
    z("erinnerab", "Erinnern ab Rückstand", 300, 50, 2000, "ml"),
    z("erinnerpause", "Erst nach … ohne Getränk", 90, 15, 600, "min"),
    z("erinnerabstand", "Abstand zwischen Erinnerungen", 60, 15, 600, "min"),
  ] },
  { titel: "Getränke auf der Uhr", felder: [1, 2, 3, 4, 5, 6].flatMap((i) => [
    { id: `g${i}name`, art: "text", text: `Getränk ${i}`, std: ["Mineralwasser", "Cola", "Cola Zero", "Eistee Pfirsich", "Orangensaft", ""][i - 1] },
    { id: `g${i}kcal`, art: "komma", text: "kcal je 100 ml", std: [0, 42, 0.3, 18, 45, 0][i - 1], min: 0, max: 500 },
  ]) },
  { titel: "Ziffernblatt", felder: [1, 2, 3, 4].map((i) => (
    { id: `feld${i}`, art: "feld", text: `Feld ${i} (${["oben links", "oben rechts", "unten links", "unten rechts"][i - 1]})`,
      std: [0, 1, 2, 3][i - 1] })) },
];

export const ALLE = GRUPPEN.flatMap((g) => g.felder);

const minute = (t) => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t || "").trim());
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1;
};

// Formularwerte (Texte) prüfen → { werte, fehler: [Text …], hinweise: [Text …] }
// werte: wie sie an die Uhr gehen (felder als "0,1,2,3")
export function pruefen(roh) {
  const werte = {}, fehler = [], hinweise = [];
  const felder = [];
  for (const f of ALLE) {
    const v = roh[f.id];
    if (f.art === "schalter") { werte[f.id] = !!v; continue; }
    if (f.art === "text") { werte[f.id] = String(v ?? "").trim().slice(0, 30); continue; }
    if (f.art === "feld") {
      const a = Number(v);
      felder.push(FELD_ARTEN.some(([n]) => n === a) ? a : f.std);
      continue;
    }
    if (f.art === "zeit") {
      const m = minute(v);
      if (m < 0) { fehler.push(`${f.text}: bitte als Uhrzeit wie 06:00`); continue; }
      werte[f.id] = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      continue;
    }
    const n = Number(String(v ?? "").replace(",", "."));
    if (String(v ?? "").trim() === "" || !Number.isFinite(n) || n < f.min || n > f.max) {
      fehler.push(`${f.text}: bitte eine Zahl von ${f.min} bis ${f.max}`);
      continue;
    }
    werte[f.id] = f.art === "komma" ? Math.round(n * 10) / 10 : Math.round(n);
  }
  werte.felder = felder.join(",");
  if (!fehler.length) {
    const t = ["e1zeit", "e2zeit", "e3zeit", "e4zeit"].map((k) => minute(werte[k]));
    if (!t.every((x, i) => i === 0 || t[i - 1] < x)) fehler.push("Die vier Freigaben müssen zeitlich nacheinander liegen.");
    if (minute(werte.wachvon) >= minute(werte.wachbis)) fehler.push("Die Schlafenszeit muss abends beginnen und morgens enden (Ende früher am Tag als Beginn).");
    const summe = werte.e1anteil + werte.e2anteil + werte.e3anteil + werte.e4anteil;
    if (summe <= 0) fehler.push("Die Anteile der Freigaben dürfen nicht alle 0 sein.");
    else if (summe !== 100) hinweise.push(`Die Anteile ergeben ${summe} % – die Uhr rechnet sie auf 100 % um.`);
  }
  return { werte, fehler, hinweise };
}

// Werte fürs Formular: gespeichert (Handy) vor gemeldet (Uhr) vor Standard
export function vorbelegen(gespeichert, vonUhr) {
  const erg = {};
  const felder = String((gespeichert && gespeichert.felder) || "").split(",").map(Number);
  for (const f of ALLE) {
    if (f.art === "feld") {
      const i = Number(f.id.slice(4)) - 1;
      erg[f.id] = felder.length === 4 && Number.isFinite(felder[i]) ? felder[i] : f.std;
      continue;
    }
    const q = [gespeichert, vonUhr].find((x) => x && x[f.id] !== undefined && x[f.id] !== null);
    erg[f.id] = q ? q[f.id] : f.std;
  }
  return erg;
}
