package io.github.salamandercreator.bauchtagebuch

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Zustand der Uhr-Verbindung, Testknopf und Protokoll */
class UhrStatusActivity : Activity() {

    private lateinit var zustand: TextView
    private lateinit var protokoll: TextView
    private lateinit var akkuKnopf: Button
    private val aktualisieren: () -> Unit = { anzeigen() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val abstand = (16 * resources.displayMetrics.density).toInt()
        val spalte = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(abstand, abstand, abstand, abstand)
        }
        zustand = TextView(this).apply { textSize = 16f }
        val test = Button(this).apply {
            text = "Test an die Uhr senden"
            setOnClickListener { Uhr.testSenden() }
        }
        akkuKnopf = Button(this).apply {
            text = "Akku-Optimierung für diese App ausschalten"
            setOnClickListener { akkuAusnahme() }
        }
        val app = Button(this).apply {
            text = "Zurück zum Bauchtagebuch"
            setOnClickListener { startActivity(Intent(this@UhrStatusActivity, MainActivity::class.java)); finish() }
        }
        protokoll = TextView(this).apply {
            textSize = 13f
            setPadding(0, abstand, 0, 0)
            setTextIsSelectable(true)
        }
        listOf(zustand, test, akkuKnopf, app, protokoll).forEach { spalte.addView(it, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)) }
        setContentView(ScrollView(this).apply { addView(spalte) })
        UhrDienst.starten(this)
    }

    override fun onResume() {
        super.onResume()
        Uhr.beobachten(aktualisieren)
        anzeigen()
    }

    override fun onPause() {
        Uhr.nichtMehrBeobachten(aktualisieren)
        super.onPause()
    }

    private fun akkuFrei(): Boolean =
        getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

    @SuppressLint("BatteryLife")
    private fun akkuAusnahme() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun anzeigen() {
        val zuletzt = if (Uhr.letzteNachricht == 0L) "noch keine"
        else SimpleDateFormat("dd.MM. HH:mm:ss", Locale.GERMANY).format(Date(Uhr.letzteNachricht))
        zustand.text = "Connect IQ: ${Uhr.sdkZustand}\n${Uhr.geraeteText()}\nLetzte Nachricht von der Uhr: $zuletzt" +
            "\nAkku-Optimierung: " + (if (akkuFrei()) "aus ✓" else "an (Android kann die Verbindung beenden)")
        akkuKnopf.isEnabled = !akkuFrei()
        protokoll.text = Uhr.protokollText()
    }
}
