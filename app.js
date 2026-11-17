// Bauchtagebuch – Oberfläche
import * as L from "./logik.js";
import * as S from "./speicher.js";
import * as A from "./abgleich.js";

const $ = (id) => document.getElementById(id);

const zustand = {
  typ: "essen",
  tag: L.heute(),
  bearbeite: null,        // Eintrag, der gerade bearbeitet wird
  symptome: new Set(),
  staerke: 3,
  bristol: null,
  kcalManuell: false,     // kcal selbst getippt
  vorlage: null,          // übernommener früherer Eintrag {text, menge, kcal}
  loeschBereit: null,     // ID, deren Löschen bestätigt werden muss
};

// ------------------------------------------------------------------ Hilfen

function status(text, fehler = false) {
  const s = $("status");
  s.textContent = text;
  s.classList.toggle("fehler", fehler);
}

function el(tag, attrs = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const k of kinder.flat()) if (k !== null && k !== undefined && k !== false) {
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

function herunterladen(name, inhalt, mime) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: mime }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function kcalText(e) {
  if (typeof e.kcal !== "number") {
    return el("span", { class: "offen", title: "Gemini schätzt offene Einträge spätestens 30 Minuten nach dem Abgleich" },
      "kcal folgt");
  }
  if (e.kcalQuelle === "eigene") return `${e.kcal} kcal`;
  if (e.kcalQuelle === "verlauf") return el("span", { title: "aus deinen früheren Einträgen" }, `≈ ${e.kcal} kcal`);
  if (e.kcalQuelle === "veraltet") return el("span", { class: "offen" }, `≈ ${e.kcal} kcal (Schätzung veraltet)`);
  return `≈ ${e.kcal} kcal`;
}

// ------------------------------------------------------------------ Formular

function formularAufbauen() {
  for (const m of L.MAHLZEITEN) $("f_mahlzeit").append(el("option", { value: m }, m));

  for (const s of L.SYMPTOME) {
    $("f_symptome").append(el("button", {
      type: "button", class: "chip", "data-s": s,
      onclick: () => {
        zustand.symptome.has(s) ? zustand.symptome.delete(s) : zustand.symptome.add(s);
        auswahlZeigen();
      },
    }, s));
  }
  for (let i = 1; i <= 5; i++) {
    $("f_staerke").append(el("button", {
      type: "button", class: "stufe", "data-w": i,
      onclick: () => { zustand.staerke = i; auswahlZeigen(); },
    }, i));
  }
  for (let i = 1; i <= 7; i++) {
    const [art, deutung] = L.BRISTOL[i];
    $("f_bristol").append(el("button", {
      type: "button", "data-w": i, class: i === 3 || i === 4 ? "normal" : "",
      onclick: () => { zustand.bristol = i; auswahlZeigen(); },
    }, el("b", {}, i), el("span", {}, art, " ", el("small", {}, `(${deutung})`))));
  }

  document.querySelectorAll(".typ").forEach((b) => b.addEventListener("click", () => typWechseln(b.dataset.typ)));
  $("f_jetzt").addEventListener("click", () => { $("f_zeit").value = L.jetztZeit(); });
  $("form").addEventListener("submit", (ev) => { ev.preventDefault(); speichern(); });
  $("f_abbrechen").addEventListener("click", () => formularLeeren());
  $("f_kein").addEventListener("click", keinStuhlgang);

  $("f_text").addEventListener("input", () => {
    if (zustand.vorlage && $("f_text").value.trim() !== zustand.vorlage.text) {
      // anderer Text: übernommene kcal gelten nicht mehr
      if (!zustand.kcalManuell) $("f_kcal").value = "";
      zustand.vorlage = null;
    }
    vorschlaegeZeigen();
    kcalHinweis();
  });
  $("f_text").addEventListener("focus", vorschlaegeZeigen);
  $("f_menge").addEventListener("input", () => {
    if (zustand.vorlage && !zustand.kcalManuell) {
      // Menge geändert: nicht die alten kcal übernehmen, sondern neu bestimmen
      $("f_kcal").value = "";
      zustand.vorlage = null;
    }
    kcalHinweis();
  });
  $("f_kcal").addEventListener("input", () => {
    zustand.kcalManuell = $("f_kcal").value !== "";
    kcalHinweis();
  });
}

function typWechseln(typ) {
  zustand.typ = typ;
  $("form").dataset.typ = typ;
  document.querySelectorAll(".typ").forEach((b) => {
    b.classList.toggle("aktiv", b.dataset.typ === typ);
    b.setAttribute("aria-selected", b.dataset.typ === typ);
  });
  vorschlaegeZeigen();
  kcalHinweis();
}

function auswahlZeigen() {
  document.querySelectorAll("#f_symptome .chip").forEach((b) => b.classList.toggle("an", zustand.symptome.has(b.dataset.s)));
  document.querySelectorAll("#f_staerke .stufe").forEach((b) => b.classList.toggle("an", Number(b.dataset.w) === zustand.staerke));
  document.querySelectorAll("#f_bristol button").forEach((b) => b.classList.toggle("an", Number(b.dataset.w) === zustand.bristol));
}

function formularLeeren() {
  zustand.bearbeite = null;
  zustand.symptome = new Set();
  zustand.staerke = 3;
  zustand.bristol = null;
  zustand.kcalManuell = false;
  zustand.vorlage = null;
  $("form").reset();
  $("f_datum").value = zustand.tag;
  $("f_zeit").value = L.jetztZeit();
  $("form").classList.remove("bearbeiten");
  $("formular_titel").textContent = "Neuer Eintrag";
  $("f_speichern").textContent = "Speichern";
  $("f_abbrechen").hidden = true;
  $("f_mehr").open = false;
  auswahlZeigen();
  vorschlaegeZeigen();
  kcalHinweis();
  zeitleisteZeigen();
}

function bearbeiten(e) {
  formularLeeren();
  zustand.bearbeite = e;
  typWechseln(e.typ);
  $("f_datum").value = e.datum;
  $("f_zeit").value = e.zeit || "";
  $("f_notiz").value = e.notiz || "";
  if (L.istEssen(e)) {
    $("f_text").value = e.text || "";
    $("f_menge").value = e.menge || "";
    $("f_kcal").value = typeof e.kcal === "number" ? e.kcal : "";
    $("f_mahlzeit").value = e.mahlzeit || "";
    $("f_mehr").open = !!e.mahlzeit;
    zustand.kcalManuell = e.kcalQuelle === "eigene";
  } else if (e.typ === "symptom") {
    zustand.symptome = new Set(e.symptome || []);
    zustand.staerke = Number(e.staerke) || 3;
  } else {
    zustand.bristol = e.bristol || null;
  }
  $("form").classList.add("bearbeiten");
  $("formular_titel").textContent = "Eintrag bearbeiten";
  $("f_speichern").textContent = "Änderung speichern";
  $("f_abbrechen").hidden = false;
  auswahlZeigen();
  kcalHinweis();
  zeitleisteZeigen();
  $("formular").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Was passiert mit den kcal beim Speichern? (für Hinweis und Speichern gleich)
function kcalPlan(neu) {
  const feld = $("f_kcal").value;
  const alt = zustand.bearbeite;
  if (zustand.kcalManuell && feld !== "") return { kcal: Number(feld), quelle: "eigene" };
  if (alt && L.istEssen(alt)) {
    const gleich = alt.typ === neu.typ && (alt.text || "") === neu.text && (alt.menge || "") === neu.menge;
    const feldGleich = feld === (typeof alt.kcal === "number" ? String(alt.kcal) : "");
    if (gleich && feldGleich) return { kcal: alt.kcal, quelle: alt.kcalQuelle };
  }
  if (zustand.vorlage && feld !== "" && zustand.vorlage.text === neu.text && zustand.vorlage.menge === neu.menge) {
    return { kcal: Number(feld), quelle: "verlauf" };
  }
  const v = L.kcalAusVerlauf(S.eintraege(), { ...neu, id: alt ? alt.id : null });
  if (v !== null) return { kcal: v, quelle: "verlauf" };
  return { kcal: null, quelle: "veraltet" };
}

function kcalHinweis() {
  const h = $("kcal_hinweis");
  if (!L.istEssen({ typ: zustand.typ })) { h.textContent = ""; return; }
  const text = $("f_text").value.trim();
  if (!text) { h.textContent = ""; return; }
  const p = kcalPlan({ typ: zustand.typ, text, menge: $("f_menge").value.trim() });
  if (p.quelle === "eigene") h.textContent = "Deine kcal werden nie überschrieben.";
  else if (p.quelle === "verlauf") h.textContent = `≈ ${p.kcal} kcal aus deinen früheren Einträgen.`;
  else if (zustand.bearbeite && p.kcal !== null) h.textContent = "";
  else h.textContent = "Ohne kcal: Gemini schätzt sie spätestens 30 Minuten nach dem Abgleich (oder trag sie selbst ein).";
}

function vorschlaegeZeigen() {
  const box = $("vorschlaege");
  box.replaceChildren();
  if (!L.istEssen({ typ: zustand.typ })) return;
  const eingabe = $("f_text").value;
  const v = L.vorschlaege(S.eintraege(), zustand.typ, eingabe);
  for (const g of v.eintraege) {
    const j = g.juengster;
    const info = [j.menge, typeof j.kcal === "number" ? `${j.kcal} kcal` : ""].filter(Boolean).join(" · ");
    box.append(el("button", {
      type: "button", class: "vorschlag", title: g.text,
      onclick: () => {
        $("f_text").value = g.text;
        $("f_menge").value = j.menge || "";
        $("f_kcal").value = typeof j.kcal === "number" ? j.kcal : "";
        zustand.kcalManuell = false;
        zustand.vorlage = { text: g.text, menge: (j.menge || "").trim() };
        vorschlaegeZeigen();
        kcalHinweis();
      },
    }, g.text, info ? el("small", {}, info) : null));
  }
  for (const z of v.zutaten) {
    box.append(el("button", {
      type: "button", class: "vorschlag zutat", title: "Zutat übernehmen",
      onclick: () => {
        const teile = $("f_text").value.split(",");
        teile[teile.length - 1] = (teile.length > 1 ? " " : "") + z;
        $("f_text").value = teile.join(",") + ", ";
        $("f_text").focus();
        vorschlaegeZeigen();
        kcalHinweis();
      },
    }, z));
  }
}

async function speichern() {
  const typ = zustand.typ;
  const alt = zustand.bearbeite;
  const e = alt ? { ...alt } : { id: L.neueId(), erstellt: new Date().toISOString() };
  e.typ = typ;
  e.datum = $("f_datum").value;
  e.zeit = $("f_zeit").value;
  e.notiz = $("f_notiz").value.trim();
  if (!e.datum) return status("Bitte ein Datum angeben.", true);
  // Felder anderer Arten entfernen
  for (const f of ["text", "menge", "mahlzeit", "kcal", "kcalQuelle", "symptome", "staerke", "bristol", "kein"]) delete e[f];
  e.text = ""; e.menge = ""; e.mahlzeit = "";

  if (L.istEssen(e)) {
    e.text = $("f_text").value.trim();
    e.menge = $("f_menge").value.trim();
    e.mahlzeit = $("f_mahlzeit").value;
    if (!e.text) return status("Bitte angeben, was es war.", true);
    if (!e.zeit && !e.mahlzeit) return status("Bitte eine Uhrzeit oder eine Mahlzeit angeben.", true);
    const p = kcalPlan(e);
    if (p.kcal !== null) e.kcal = p.kcal;
    e.kcalQuelle = p.quelle;
  } else if (typ === "symptom") {
    if (!zustand.symptome.size) return status("Bitte mindestens ein Symptom wählen.", true);
    if (!e.zeit) return status("Bitte eine Uhrzeit angeben.", true);
    e.symptome = L.SYMPTOME.filter((s) => zustand.symptome.has(s));
    e.staerke = zustand.staerke;
  } else {
    if (!zustand.bristol) return status("Bitte einen Typ der Bristol-Skala wählen.", true);
    if (!e.zeit) return status("Bitte eine Uhrzeit angeben.", true);
    e.bristol = zustand.bristol;
  }
  await S.speichern(e);
  A.bald();
  status(alt ? "Änderung gespeichert." : `${L.TYP_NAME[typ]} gespeichert.`);
  zustand.tag = e.datum;
  formularLeeren();
  allesZeigen();
}

async function keinStuhlgang() {
  const datum = $("f_datum").value || zustand.tag;
  if (S.eintraege().some((e) => e.datum === datum && e.typ === "stuhl" && e.kein)) {
    return status("Für diesen Tag ist „kein Stuhlgang“ schon eingetragen.");
  }
  await S.speichern({ id: L.neueId(), erstellt: new Date().toISOString(), typ: "stuhl", datum,
    zeit: "", mahlzeit: "", text: "", menge: "", notiz: $("f_notiz").value.trim(), kein: true });
  A.bald();
  status("„Kein Stuhlgang“ gespeichert.");
  zustand.tag = datum;
  formularLeeren();
  allesZeigen();
}

// ------------------------------------------------------------------ Tagesansicht

function zeitleisteZeigen() {
  const tag = zustand.tag;
  $("tag_titel").textContent = L.tagTitel(tag);
  const liste = L.sortieren(S.eintraege().filter((e) => e.datum === tag));
  const s = L.tagesSumme(liste);
  const summe = $("tag_summe");
  summe.replaceChildren(`${s.geschaetzt ? "≈ " : ""}${s.kcal.toLocaleString("de-DE")} kcal`);
  if (s.fehlen) summe.append(" ", el("small", {}, `· bei ${s.fehlen} ${s.fehlen === 1 ? "Eintrag" : "Einträgen"} fehlen kcal`));

  const ol = $("zeitleiste");
  ol.replaceChildren();
  for (const e of liste) {
    const zeit = e.zeit ? e.zeit : (e.mahlzeit ? el("span", {}, `ca. ${L.wirksameZeit(e)}`) : "–");
    let inhalt, meta = [];
    if (L.istEssen(e)) {
      inhalt = e.text;
      if (e.menge) meta.push(e.menge);
      meta.push(kcalText(e));
    } else if (e.typ === "symptom") {
      const punkte = el("span", { class: "punkte", "aria-label": `Stärke ${e.staerke} von 5` });
      for (let i = 1; i <= 5; i++) punkte.append(el("span", { class: i <= e.staerke ? "" : "aus" }, "●"));
      inhalt = (e.symptome || []).join(", ");
      meta.push(punkte);
    } else if (e.kein) {
      inhalt = "Kein Stuhlgang an diesem Tag";
    } else {
      const [art, deutung] = L.BRISTOL[e.bristol] || ["?", ""];
      inhalt = `Typ ${e.bristol}: ${art}`;
      meta.push(deutung);
    }
    if (e.notiz) meta.push(e.notiz);
    const metaEl = el("div", { class: "e_meta" });
    meta.forEach((m, i) => { if (i) metaEl.append(" · "); metaEl.append(m); });

    const loeschen = el("button", {
      type: "button", class: zustand.loeschBereit === e.id ? "sicher" : "",
      onclick: async () => {
        if (zustand.loeschBereit !== e.id) {
          zustand.loeschBereit = e.id;
          zeitleisteZeigen();
          setTimeout(() => { if (zustand.loeschBereit === e.id) { zustand.loeschBereit = null; zeitleisteZeigen(); } }, 4000);
          return;
        }
        zustand.loeschBereit = null;
        await S.loeschen(e.id);
        A.bald();
        if (zustand.bearbeite && zustand.bearbeite.id === e.id) formularLeeren();
        status("Eintrag gelöscht.");
        allesZeigen();
      },
    }, zustand.loeschBereit === e.id ? "Wirklich löschen?" : "Löschen");

    ol.append(el("li", {
      class: `eintrag ${e.typ}${L.auffaellig(e) ? " auffaellig" : ""}${zustand.bearbeite && zustand.bearbeite.id === e.id ? " bearbeitet" : ""}`,
      style: `border-left-color: var(--${e.typ})`,
    },
      el("div", { class: "e_zeit" }, zeit, e.mahlzeit && e.zeit ? el("small", {}, e.mahlzeit) : null),
      el("div", {}, el("div", { class: "e_inhalt" }, el("span", { class: `etikett ${e.typ}` }, L.TYP_NAME[e.typ]), inhalt), metaEl),
      el("div", { class: "e_aktionen" },
        el("button", { type: "button", onclick: () => bearbeiten(e) }, "Bearbeiten"), loeschen),
    ));
  }
  // auffällige Einträge: Rand in der Beschwerdefarbe statt der Typfarbe
  ol.querySelectorAll(".eintrag.auffaellig").forEach((li) => { li.style.borderLeftColor = ""; });
}

// ------------------------------------------------------------------ 14 Tage

function vierzehnZeigen() {
  const box = $("vierzehn");
  box.replaceChildren();
  const alle = S.eintraege();
  const h = L.heute();
  for (let i = 13; i >= 0; i--) {
    const d = L.tageVerschieben(h, -i);
    const liste = alle.filter((e) => e.datum === d);
    const max = Math.max(0, ...liste.map(L.schwere));
    const stuhl = liste.filter((e) => e.typ === "stuhl");
    let punkt = "";
    if (stuhl.some((e) => !e.kein && e.bristol >= 6)) punkt = "durchfall";
    else if (stuhl.some((e) => !e.kein && e.bristol <= 2)) punkt = "hart";
    else if (stuhl.some((e) => !e.kein)) punkt = "normal";
    else if (stuhl.some((e) => e.kein)) punkt = "kein";
    const s = L.tagesSumme(liste);
    box.append(el("button", {
      type: "button", class: `t14${d === zustand.tag ? " gewaehlt" : ""}`,
      title: `${L.tagTitel(d)}${max ? ` · Beschwerde ${max}` : ""}${s.kcal ? ` · ${s.kcal} kcal` : ""}`,
      onclick: () => { zustand.tag = d; if (!zustand.bearbeite) $("f_datum").value = d; allesZeigen(); },
    },
      el("span", { class: `saeule${max ? "" : " null"}`, style: `height:${max ? max * 12 : 2}px` }),
      el("span", { class: `punkt ${punkt}` }),
      el("span", { class: "wt" }, L.WT_KURZ[L.wochentag(d)]),
      el("span", { class: "tg" }, Number(d.slice(8))),
      el("span", { class: "kk" }, L.kTausend(s.kcal)),
    ));
  }
}

// ------------------------------------------------------------------ Muster

function musterZeigen() {
  const tb = $("muster").querySelector("tbody");
  tb.replaceChildren();
  for (const s of L.muster(S.eintraege()).slice(0, 15)) {
    const p = Math.round(s.anteil * 100);
    tb.append(el("tr", {},
      el("td", {}, s.zutat),
      el("td", {}, `${s.danach} von ${s.gegessen}`),
      el("td", {}, el("div", { class: "balken" }, el("span", { style: `width:${Math.max(Math.round(p * 0.6), 2)}px` }), `${p} %`)),
    ));
  }
}

// ------------------------------------------------------------------ Daten

function zeitraum() {
  const w = $("d_zeitraum").value;
  const alle = S.eintraege();
  const bis = L.heute();
  if (w === "alles") {
    const von = alle.reduce((m, e) => (e.datum < m ? e.datum : m), bis);
    return [von, bis];
  }
  return [L.tageVerschieben(bis, -(Number(w) - 1)), bis];
}

function exportListe() {
  // Ausgabe ohne interne Felder, sortiert
  return L.sortieren(S.eintraege()).sort((a, b) => a.datum.localeCompare(b.datum))
    .map(({ sync, geloescht, ...rest }) => rest);
}

function datenAufbauen() {
  $("d_json").addEventListener("click", () => {
    herunterladen(`bauchtagebuch_${L.heute()}.json`, JSON.stringify(exportListe(), null, 2), "application/json");
    status("JSON exportiert.");
  });
  $("d_csv").addEventListener("click", () => {
    herunterladen(`bauchtagebuch_${L.heute()}.csv`, L.csv(exportListe()), "text/csv");
    status("CSV exportiert.");
  });
  $("d_ki").addEventListener("click", () => {
    const [von, bis] = zeitraum();
    herunterladen(`bauchtagebuch_ki_${von}_bis_${bis}.md`, L.kiExport(S.eintraege(), von, bis), "text/markdown");
    status("KI-Datei erstellt: bei Claude hochladen und abschicken.");
  });
  $("d_ki_kopieren").addEventListener("click", async () => {
    const [von, bis] = zeitraum();
    try {
      await navigator.clipboard.writeText(L.kiExport(S.eintraege(), von, bis));
      status("KI-Text kopiert: im Chat einfügen und abschicken.");
    } catch {
      status("Kopieren nicht möglich – bitte „Für KI-Auswertung (.md)“ nehmen.", true);
    }
  });
  $("d_import").addEventListener("change", async (ev) => {
    const datei = ev.target.files[0];
    ev.target.value = "";
    if (datei) await importieren(datei);
  });
}

// Import einer JSON-Datei (Export des alten oder dieses Bauchtagebuchs) mit Prüfung
async function importieren(datei) {
  let liste;
  try {
    liste = JSON.parse(await datei.text());
    if (!Array.isArray(liste)) liste = Object.values(liste).find(Array.isArray);
    if (!Array.isArray(liste)) throw new Error("keine Liste von Einträgen");
  } catch (err) {
    return status(`Import nicht möglich: ${err.message}`, true);
  }
  const gueltig = [];
  let ungueltig = 0;
  for (const e of liste) {
    if (!e || !e.id || !e.datum || !L.TYPEN.includes(e.typ)) { ungueltig++; continue; }
    const neu = { ...e, sync: false };
    if (neu.kein === "True" || neu.kein === "true") neu.kein = true;
    if (typeof neu.kcal === "string" && neu.kcal !== "") neu.kcal = Number(neu.kcal);
    delete neu.geloescht;
    gueltig.push(neu);
  }
  // Tagessummen laut Datei
  const summen = (eintraege) => {
    const m = {};
    for (const e of eintraege) if (L.istEssen(e) && typeof e.kcal === "number") m[e.datum] = (m[e.datum] || 0) + e.kcal;
    return m;
  };
  const sollSummen = summen(gueltig);
  const ids = new Set(gueltig.map((e) => e.id));
  const vorher = S.eintraege().filter((e) => ids.has(e.id)).length;

  await S.uebernehmen(gueltig);
  const nachher = await S.neuLesen();

  // Prüfung: alle IDs da, Tagessummen der importierten Tage gleich
  const da = nachher.filter((e) => ids.has(e.id));
  const istSummen = summen(da);
  const abweichend = Object.keys(sollSummen).filter((d) => sollSummen[d] !== istSummen[d]);
  const tage = Object.keys(sollSummen).length;
  let text = `Import: ${da.length} von ${gueltig.length} Einträgen übernommen` +
    (vorher ? ` (${vorher} davon ersetzt)` : "") + `, ${tage} Tage mit kcal`;
  text += abweichend.length ? ` – ACHTUNG: Tagessummen weichen ab an ${abweichend.join(", ")}.` : ", Tagessummen identisch.";
  if (ungueltig) text += ` ${ungueltig} ungültige Zeilen übersprungen.`;
  const nach = await nachschaetzen();
  if (nach) text += ` ${nach} offene kcal aus dem Verlauf ergänzt.`;
  status(text, abweichend.length > 0 || da.length !== gueltig.length);
  console.info("Import geprüft", { soll: sollSummen, ist: istSummen });
  allesZeigen();
  A.bald();
}

// Offene kcal (ausstehend) aus dem Verlauf nachtragen, wo möglich
async function nachschaetzen() {
  let n = 0;
  for (const e of S.eintraege()) {
    if (!L.istEssen(e) || typeof e.kcal === "number" || e.kcalQuelle === "eigene") continue;
    const v = L.kcalAusVerlauf(S.eintraege(), e);
    if (v === null) continue;
    await S.speichern({ ...e, kcal: v, kcalQuelle: "verlauf" });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ Abgleich

function uhrzeit(d) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

async function abgleichAufbauen() {
  const e = await A.einstellungen();
  $("a_url").value = e.url || "";
  $("a_schluessel").value = e.schluessel || "";
  if (e.zuletzt) $("a_stand").textContent = `Zuletzt abgeglichen: ${new Date(e.zuletzt).toLocaleString("de-DE")}`;

  $("a_speichern").addEventListener("click", async () => {
    const url = $("a_url").value, schluessel = $("a_schluessel").value;
    const testServer = /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url.trim());
    if (!testServer && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url.trim())) {
      return status("Bitte die Web-App-URL von Apps Script eintragen (endet auf /exec).", true);
    }
    status("Verbindung wird geprüft …");
    try {
      const t = await A.testen(url, schluessel);
      await A.einstellungenSetzen(url, schluessel);
      status(`Verbindung ok (${t.eintraege} Einträge bei Google). Abgleich läuft …`);
      const r = await A.abgleichen();
      if (r && r.ok) status(`Abgleich fertig: ${r.gesendet} gesendet, ${r.empfangen} empfangen.`);
    } catch (err) {
      status(`Verbindung nicht möglich: ${err.message}`, true);
    }
  });
  $("a_jetzt").addEventListener("click", async () => {
    const r = await A.abgleichen();
    if (r && r.ok) status(`Abgleich fertig: ${r.gesendet} gesendet, ${r.empfangen} empfangen.`);
    else if (!r) status("Abgleich nicht eingerichtet oder kein Netz.", true);
  });
  $("einst_knopf").addEventListener("click", () => $("einstellungen").showModal());
  $("einst_zu").addEventListener("click", () => $("einstellungen").close());
  $("sync_anzeige").addEventListener("click", () => {
    $("einstellungen").showModal();
    $("abgleich_titel").scrollIntoView({ block: "start" });
  });
  // Ohne Verbindung gleich beim Start die Einstellungen zeigen, damit man weiß, was zu tun ist
  if (!e.url || !e.schluessel) $("a_stand").textContent = "Noch nicht verbunden: URL und Schlüssel eintragen.";

  A.beiAenderung((z) => {
    const b = $("sync_anzeige");
    b.className = "sync_anzeige";
    if (z.art === "aus") b.textContent = "☁ nicht eingerichtet";
    else if (z.art === "offline") { b.textContent = `☁ offline · ${z.offen} offen`; b.classList.add("offen"); }
    else if (z.art === "laeuft") b.textContent = "☁ gleicht ab …";
    else if (z.art === "fehler") { b.textContent = `☁ Fehler · ${z.offen} offen`; b.classList.add("fehler"); b.title = z.text; }
    else {
      b.textContent = z.offen ? `☁ ${z.offen} offen` : `☁ ${uhrzeit(z.zuletzt)}`;
      b.classList.add(z.offen ? "offen" : "ok");
      b.title = "Zuletzt abgeglichen " + z.zuletzt.toLocaleString("de-DE");
      $("a_stand").textContent = `Zuletzt abgeglichen: ${z.zuletzt.toLocaleString("de-DE")}`;
      if (z.empfangen) allesZeigen();   // Änderungen vom anderen Gerät anzeigen
    }
    if (z.art === "fehler") $("a_stand").textContent = `Letzter Versuch fehlgeschlagen: ${z.text}`;
  });
}

// ------------------------------------------------------------------ Start

function allesZeigen() {
  zeitleisteZeigen();
  vierzehnZeigen();
  musterZeigen();
}

async function start() {
  formularAufbauen();
  datenAufbauen();
  $("tag_zurueck").addEventListener("click", () => tagSetzen(L.tageVerschieben(zustand.tag, -1)));
  $("tag_vor").addEventListener("click", () => tagSetzen(L.tageVerschieben(zustand.tag, 1)));
  $("tag_heute").addEventListener("click", () => tagSetzen(L.heute()));
  try {
    await S.oeffnen();
  } catch (err) {
    status(`Speicher nicht verfügbar: ${err.message}`, true);
  }
  const nach = await nachschaetzen();
  typWechseln("essen");
  formularLeeren();
  allesZeigen();
  const n = S.eintraege().length;
  status(n ? `${n} Einträge geladen.${nach ? ` ${nach} offene kcal aus dem Verlauf ergänzt.` : ""}`
    : "Noch keine Einträge – über ⚙ oben rechts mit Google verbinden oder einen Export importieren.");
  await abgleichAufbauen();
  A.automatischStarten();
}

function tagSetzen(d) {
  zustand.tag = d;
  if (!zustand.bearbeite) $("f_datum").value = d;
  allesZeigen();
}

// Offline-Speicher für die Programmdateien (nur über http(s), nicht als Datei geöffnet)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline-Speicher nicht verfügbar", err));
}

// zum Testen in der Konsole
window.bauchtagebuch = { L, S, A, zustand, importieren };

start();
