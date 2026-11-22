package io.github.salamandercreator.bauchtagebuch

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Kleiner Speicher der Android-App (nur auf diesem Handy, im privaten App-Bereich):
 *  - basis:   Tageswerte, die die Web-App zuletzt ausgerechnet hat
 *  - eingang: Einträge von der Uhr, die die Web-App noch nicht übernommen hat
 *  - google:  welche davon (in welcher Fassung) schon direkt an Google gegeben wurden
 *  - bekannt: IDs der letzten Uhr-Einträge (nichts doppelt anlegen)
 *  - zugang:  URL und Schlüssel des Google-Abgleichs (aus der Web-App)
 */
object Speicher {
    private lateinit var p: SharedPreferences
    private const val BEKANNT_TAGE = 14L

    fun init(ctx: Context) {
        if (!::p.isInitialized) p = ctx.applicationContext.getSharedPreferences("uhr", Context.MODE_PRIVATE)
    }

    @Synchronized fun basis(): JSONObject? =
        p.getString("basis", null)?.let { try { JSONObject(it) } catch (_: Exception) { null } }

    @Synchronized fun basisSetzen(json: String) {
        try { JSONObject(json) } catch (_: Exception) { return }
        p.edit().putString("basis", json).apply()
    }

    @Synchronized fun eingang(): MutableList<JSONObject> =
        UhrLogik.liste(try { JSONArray(p.getString("eingang", "[]")) } catch (_: Exception) { JSONArray() })

    @Synchronized fun eingangText(): String = p.getString("eingang", "[]") ?: "[]"

    private fun eingangSchreiben(l: List<JSONObject>) {
        p.edit().putString("eingang", JSONArray(l.takeLast(300)).toString()).apply()
    }

    private fun bekannt(): JSONObject = try { JSONObject(p.getString("bekannt", "{}")!!) } catch (_: Exception) { JSONObject() }

    /**
     * Eintrag von der Uhr aufnehmen. Ein neuer Eintrag, den es schon gibt, wird ignoriert; ein Löschauftrag
     * ersetzt den noch nicht übernommenen Eintrag oder wird selbst gemerkt. Gibt true zurück, wenn sich etwas
     * geändert hat (die ID wird in jedem Fall bestätigt).
     */
    @Synchronized fun aufnehmen(e: JSONObject): Boolean {
        val id = e.optString("id")
        val l = eingang()
        val i = l.indexOfFirst { it.optString("id") == id }
        val b = bekannt()
        if (UhrLogik.istGeloescht(e)) {
            if (i >= 0 && UhrLogik.istGeloescht(l[i])) return false
            if (i < 0) {
                l.add(e)
            } else if (l[i].has("typ") && !e.has("typ")) {
                // kurzer Lösch-Vermerk: vollständigen Eintrag behalten und als gelöscht markieren
                l[i] = JSONObject(l[i].toString()).put("geloescht", e.optString("geloescht"))
                    .put("geaendert", e.optString("geaendert"))
            } else {
                l[i] = e
            }
        } else {
            if (i >= 0 || b.has(id)) return false
            l.add(e)
        }
        b.put(id, System.currentTimeMillis())
        val grenze = System.currentTimeMillis() - BEKANNT_TAGE * 86_400_000
        b.keys().asSequence().toList().forEach { if (b.optLong(it) < grenze) b.remove(it) }
        p.edit().putString("bekannt", b.toString()).apply()
        eingangSchreiben(l)
        return true
    }

    /** Die Web-App hat diese IDs übernommen (sie gleicht sie ab jetzt selbst mit Google ab) */
    @Synchronized fun uebernommen(idsJson: String) {
        val ids = try {
            val a = JSONArray(idsJson); (0 until a.length()).map { a.optString(it) }.toSet()
        } catch (_: Exception) { return }
        val l = eingang().filter { it.optString("id") !in ids }
        eingangSchreiben(l)
        val g = google()
        g.keys().asSequence().toList().forEach { if (it in ids) g.remove(it) }
        p.edit().putString("google", g.toString()).apply()
    }

    private fun google(): JSONObject = try { JSONObject(p.getString("google", "{}")!!) } catch (_: Exception) { JSONObject() }

    /** Einträge, die noch nicht (in dieser Fassung) bei Google sind; nur vollständige Einträge */
    @Synchronized fun nichtBeiGoogle(): List<JSONObject> {
        val g = google()
        return eingang().filter { it.has("typ") && g.optString(it.optString("id")) != it.optString("geaendert") }
    }

    @Synchronized fun beiGoogle(l: List<JSONObject>) {
        val g = google()
        l.forEach { g.put(it.optString("id"), it.optString("geaendert")) }
        p.edit().putString("google", g.toString()).apply()
    }

    @Synchronized fun zugangSetzen(url: String, schluessel: String) {
        p.edit().putString("url", url.trim()).putString("schluessel", schluessel.trim()).apply()
    }

    @Synchronized fun zugang(): Pair<String, String>? {
        val u = p.getString("url", "") ?: ""
        val s = p.getString("schluessel", "") ?: ""
        return if (u.startsWith("https://") && s.isNotEmpty()) u to s else null
    }
}
