package io.github.salamandercreator.bauchtagebuch

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import java.io.File

/**
 * Schnittstelle für die Web-App (window.BauchUhr). Nur die eigene Seite wird im Fenster geladen
 * (siehe MainActivity), daher kann keine fremde Seite diese Funktionen benutzen.
 */
class Bruecke(private val aktivitaet: Activity) {

    /** Tageswerte aus der Web-App (logik.js uhrDaten) → sofort an die Uhr */
    @JavascriptInterface
    fun werte(json: String) {
        Speicher.basisSetzen(json)
        Uhr.werteSenden()
    }

    /** Einträge von der Uhr, die die Web-App noch nicht hat (JSON-Liste vollständiger Einträge) */
    @JavascriptInterface
    fun abholen(): String = Speicher.eingangText()

    @JavascriptInterface
    fun uebernommen(idsJson: String) = Speicher.uebernommen(idsJson)

    /** URL und Schlüssel des Google-Abgleichs, damit die App Uhr-Einträge selbst weitergeben kann */
    @JavascriptInterface
    fun zugang(url: String, schluessel: String) {
        Speicher.zugangSetzen(url, schluessel)
        Weiterleitung.anstossen()
    }

    /** Letztes Gewicht von der Uhr: {"gramm", "zeit"} oder null */
    @JavascriptInterface
    fun gewicht(): String {
        val g = Speicher.gewicht() ?: return "null"
        return org.json.JSONObject().put("gramm", g).put("zeit", Speicher.gewichtZeit()).toString()
    }

    @JavascriptInterface
    fun statusOeffnen() {
        aktivitaet.runOnUiThread { aktivitaet.startActivity(Intent(aktivitaet, UhrStatusActivity::class.java)) }
    }

    /** Export (CSV, JSON, Markdown) im Ordner „Download“ speichern */
    @JavascriptInterface
    fun dateiSpeichern(name: String, inhalt: String, mime: String): Boolean = try {
        val bytes = inhalt.toByteArray(Charsets.UTF_8)
        if (Build.VERSION.SDK_INT >= 29) {
            val werte = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime.ifEmpty { "application/octet-stream" })
            }
            val r = aktivitaet.contentResolver
            val uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, werte) ?: throw IllegalStateException()
            r.openOutputStream(uri)!!.use { it.write(bytes) }
        } else {
            val ordner = aktivitaet.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
            File(ordner, name).writeBytes(bytes)
        }
        true
    } catch (_: Exception) {
        false
    }
}
