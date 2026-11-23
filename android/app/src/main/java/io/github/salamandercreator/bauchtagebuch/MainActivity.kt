package io.github.salamandercreator.bauchtagebuch

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Zeigt die bisherige Web-App (GitHub Pages) in einem eigenen Fenster. Offline läuft sie aus dem
 * Zwischenspeicher der Seite (Service Worker), wie in Chrome. Startet außerdem den Uhr-Dienst.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var dateiRueckruf: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Speicher.init(this)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        // Dunkles Design: dunkler Hintergrund beim Laden; die Seite sieht über das dunkle App-Thema
        // prefers-color-scheme: dark und zeigt ihr dunkles Design
        web.setBackgroundColor(0xFF161815.toInt())
        if (Build.VERSION.SDK_INT >= 33) web.settings.isAlgorithmicDarkeningAllowed = true
        // window.BauchUhr: Tageswerte an die Uhr, Einträge von der Uhr abholen (nur eigene Seite, s. u.)
        web.addJavascriptInterface(Bruecke(this), "BauchUhr")

        web.webViewClient = object : WebViewClient() {
            // Nur die eigene Seite im Fenster öffnen, alles andere (z. B. HelloFresh) im Browser
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (istEigeneSeite(request.url)) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // <input type="file"> (Import JSON, Rezeptliste einlesen)
            override fun onShowFileChooser(
                view: WebView, rueckruf: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                dateiRueckruf?.onReceiveValue(null)
                dateiRueckruf = rueckruf
                return try {
                    startActivityForResult(params.createIntent(), DATEI_WAHL)
                    true
                } catch (_: Exception) {
                    dateiRueckruf = null
                    false
                }
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(if (intent?.getStringExtra(Hinweis.ZIEL) == Hinweis.GRUNDUMSATZ) "$START_URL#grundumsatz" else START_URL)

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        UhrDienst.starten(this)
    }

    // Tipp auf die Benachrichtigung „neues Gewicht“, während die App schon offen ist
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getStringExtra(Hinweis.ZIEL) == Hinweis.GRUNDUMSATZ) {
            web.evaluateJavascript("window.bauchUhrGrund && window.bauchUhrGrund()", null)
        }
    }

    override fun onResume() {
        super.onResume()
        // Neue Einträge von der Uhr gleich an die Web-App geben
        Uhr.beiEingang = { runOnUiThread { web.evaluateJavascript("window.bauchUhrNeu && window.bauchUhrNeu()", null) } }
        web.evaluateJavascript("window.bauchUhrNeu && window.bauchUhrNeu()", null)
    }

    override fun onPause() {
        Uhr.beiEingang = null
        super.onPause()
    }

    private fun istEigeneSeite(u: Uri): Boolean =
        u.scheme == "https" && u.host == HOST && (u.path ?: "/").startsWith(PFAD)

    @Deprecated("Activity-API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == DATEI_WAHL) {
            dateiRueckruf?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            dateiRueckruf = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Activity-API")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        const val HOST = "salamandercreator.github.io"
        const val PFAD = "/bauchtagebuch/"
        const val START_URL = "https://$HOST$PFAD"
        private const val DATEI_WAHL = 7
    }
}
