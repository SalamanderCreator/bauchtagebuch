package io.github.salamandercreator.bauchtagebuch

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Gibt Uhr-Einträge direkt an das Google-Script weiter, sobald Internet da ist – auch wenn die
 * Web-App geschlossen ist. Derselbe Abgleich wie in der Web-App (POST "sync"); "seit" = "9999",
 * damit nichts zurückkommt. Gleiche ID + gleiche Fassung = nichts doppelt in der Tabelle.
 */
object Weiterleitung {
    private val ausfuehrer = Executors.newSingleThreadExecutor()

    fun anstossen() {
        ausfuehrer.execute {
            try { senden() } catch (e: Exception) { Uhr.log("Weitergabe an Google später (${e.javaClass.simpleName})") }
        }
    }

    private fun senden() {
        val (url, schluessel) = Speicher.zugang() ?: return
        val offen = Speicher.nichtBeiGoogle()
        if (offen.isEmpty()) return
        val anfrage = JSONObject().put("aktion", "sync").put("schluessel", schluessel).put("seit", "9999")
            .put("aenderungen", JSONArray(offen))
        val antwort = JSONObject(post(url, anfrage.toString()))
        if (antwort.has("fehler")) {
            Uhr.log("Google meldet: ${antwort.optString("fehler")}")
            return
        }
        Speicher.beiGoogle(offen)
        Uhr.log("${offen.size} Uhr-Eintrag/Einträge an Google weitergegeben")
    }

    // Apps Script antwortet auf POST mit einer Weiterleitung, die per GET abgeholt wird
    private fun post(url: String, text: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.instanceFollowRedirects = false
        c.connectTimeout = 20_000
        c.readTimeout = 30_000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
        c.outputStream.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        val code = c.responseCode
        if (code in 300..399) {
            val ziel = c.getHeaderField("Location") ?: throw IllegalStateException("Weiterleitung ohne Ziel")
            c.disconnect()
            val g = URL(ziel).openConnection() as HttpURLConnection
            g.connectTimeout = 20_000
            g.readTimeout = 30_000
            return g.inputStream.bufferedReader().use { it.readText() }
        }
        if (code != 200) throw IllegalStateException("HTTP $code")
        return c.inputStream.bufferedReader().use { it.readText() }
    }
}
