package io.github.salamandercreator.bauchtagebuch

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Reine Rechenlogik (ohne Android), damit sie sich mit Unit-Tests prüfen lässt. */
object UhrLogik {

    private val ID = Regex("^uhr-[0-9a-z-]{4,40}$")
    private val DATUM = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val ZEIT = Regex("^\\d{2}:\\d{2}$")
    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun jetztIso(): String = ISO.format(Instant.now())

    fun isoSekunden(s: String?): Long =
        try { if (s.isNullOrEmpty()) 0 else Instant.parse(s).epochSecond } catch (_: Exception) { 0 }

    private fun zahl(o: Any?): Int? = (o as? Number)?.toInt()

    /**
     * Eintrag der Uhr ({id, d, z, t, ml, k, del}) als vollständigen Eintrag wie im Google-Script
     * (uhrAktion) – mit denselben Feldern, damit Web-App und Tabelle ihn gleich sehen.
     * null = unbrauchbar. Ein Löschauftrag ohne lesbare Daten wird zum kurzen Lösch-Vermerk {id, geloescht}.
     */
    fun eintragAusUhr(m: Map<*, *>, jetzt: String): JSONObject? {
        val id = m["id"] as? String ?: return null
        if (!ID.matches(id)) return null
        val loeschen = zahl(m["del"]) == 1
        val d = m["d"] as? String ?: ""
        val z = m["z"] as? String ?: ""
        val t = (m["t"] as? String ?: "").trim().take(40)
        val ml = zahl(m["ml"]) ?: 0
        val k = zahl(m["k"]) ?: 0
        val gueltig = t.isNotEmpty() && ml in 1..3000 && k in 0..3000 && DATUM.matches(d) && ZEIT.matches(z)
        if (!gueltig) {
            return if (loeschen) JSONObject().put("id", id).put("geloescht", jetzt).put("geaendert", jetzt) else null
        }
        val e = JSONObject()
            .put("id", id).put("typ", "trinken").put("datum", d).put("zeit", z).put("mahlzeit", "")
            .put("text", t).put("menge", "$ml ml").put("ml", ml).put("kcal", k).put("kcalQuelle", "eigene")
            .put("notiz", "über Uhr").put("quelle", "uhr").put("erstellt", jetzt).put("geaendert", jetzt)
        if (loeschen) e.put("geloescht", jetzt)
        return e
    }

    fun istGeloescht(e: JSONObject) = e.has("geloescht") && !e.isNull("geloescht")

    /**
     * Tageswerte für die Uhr: Grundlage aus der Web-App (logik.js uhrDaten) plus die Uhr-Einträge, die die
     * Web-App noch nicht übernommen hat; auf das heutige Datum umgerechnet (falls die Grundlage von gestern ist).
     */
    fun werte(basis: JSONObject, offen: List<JSONObject>, heute: LocalDate): MutableMap<String, Any> {
        val h = heute.toString()
        val tage = (6 downTo 0).map { heute.minusDays(it.toLong()).toString() }
        val kcal = HashMap<String, Int>()
        var ml = 0
        var letzter: String? = null
        var stand = basis.optLong("stand", 0)
        val ids = HashSet<String>()

        basis.optJSONArray("woche")?.let { w ->
            for (i in 0 until w.length()) {
                val o = w.optJSONObject(i) ?: continue
                if (!o.isNull("k") && o.has("k")) kcal[o.optString("d")] = o.optInt("k")
            }
        }
        if (basis.optString("datum") == h) {
            ml = basis.optInt("ml", 0)
            if (basis.has("letzterDrink") && !basis.isNull("letzterDrink")) letzter = basis.optString("letzterDrink")
        }
        basis.optJSONArray("uhrIds")?.let { a -> for (i in 0 until a.length()) ids.add(a.optString(i)) }

        for (e in offen) {
            val d = e.optString("datum")
            stand = maxOf(stand, isoSekunden(e.optString("geaendert")))
            if (d !in tage || !e.has("kcal")) continue
            val drin = e.optString("id") in ids
            val vz = if (istGeloescht(e)) (if (drin) -1 else 0) else (if (drin) 0 else 1)
            if (vz == 0) continue
            kcal[d] = (kcal[d] ?: 0) + vz * e.optInt("kcal")
            if (d == h) {
                ml += vz * e.optInt("ml")
                val z = e.optString("zeit")
                if (vz > 0 && z.isNotEmpty() && (letzter == null || z > letzter!!)) letzter = z
            }
        }

        val woche = tage.map { d -> kcal[d]?.let { mapOf("d" to d, "k" to it) } ?: mapOf("d" to d) }
        val erg = mutableMapOf<String, Any>(
            "t" to "werte", "datum" to h, "kcal" to (kcal[h] ?: 0), "woche" to woche,
            "ml" to maxOf(ml, 0), "stand" to stand.toInt()
        )
        letzter?.let { erg["letzterDrink"] = it }
        return erg
    }

    fun liste(a: JSONArray?): MutableList<JSONObject> {
        val l = mutableListOf<JSONObject>()
        if (a != null) for (i in 0 until a.length()) a.optJSONObject(i)?.let { l.add(it) }
        return l
    }
}
