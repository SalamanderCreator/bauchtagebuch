package io.github.salamandercreator.bauchtagebuch

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.util.Date
import java.util.Locale

/**
 * Verbindung zur Uhr-App „Bauchtagebuch kcal“ über das Garmin Connect IQ Mobile SDK.
 * Der Weg läuft über die Garmin-Connect-App und Bluetooth – ohne Internet.
 * Nachrichten sind kleine Maps mit "t" = Art (siehe KcalHandy.mc auf der Uhr).
 */
object Uhr {
    /** ID der Uhr-App (manifest.xml der KcalGlance) */
    const val APP_ID = "cd88d547905141f883db1aad2f7ba03f"

    private var ciq: ConnectIQ? = null
    private var kontext: Context? = null
    private val app = IQApp(APP_ID)
    private val geraete = LinkedHashMap<Long, IQDevice>()
    private val zustaende = HashMap<Long, IQDevice.IQDeviceStatus>()
    private val protokoll = ArrayDeque<String>()
    private val hoerer = LinkedHashSet<() -> Unit>()
    private val haupt = Handler(Looper.getMainLooper())
    private var pingNr = 0

    var sdkZustand = "noch nicht gestartet"
        private set

    /** Zeitpunkt der letzten Nachricht von der Uhr (ms), 0 = noch keine */
    var letzteNachricht = 0L
        private set

    /** Wird aufgerufen, wenn neue Einträge von der Uhr da sind (MainActivity gibt sie an die Web-App) */
    @Volatile var beiEingang: (() -> Unit)? = null

    private var zuletztGesendet = ""

    // ------------------------------------------------------------------ Start / Ende

    fun starten(ctx: Context) {
        if (ciq != null) return
        val k = ctx.applicationContext
        kontext = k
        Speicher.init(k)
        val c = ConnectIQ.getInstance(k, ConnectIQ.IQConnectType.WIRELESS)
        ciq = c
        sdkZustand = "verbindet mit Garmin Connect …"
        geaendert()
        try {
            c.initialize(k, false, object : ConnectIQ.ConnectIQListener {
                override fun onSdkReady() {
                    sdkZustand = "bereit"
                    log("Connect IQ bereit")
                    geraeteAnmelden()
                }

                override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
                    sdkZustand = when (status) {
                        ConnectIQ.IQSdkErrorStatus.GCM_NOT_INSTALLED -> "Garmin Connect ist nicht installiert"
                        ConnectIQ.IQSdkErrorStatus.GCM_UPGRADE_NEEDED -> "Garmin Connect muss aktualisiert werden"
                        else -> "Fehler beim Start ($status)"
                    }
                    log(sdkZustand + " – neuer Versuch in 1 Minute")
                    ciq = null
                    haupt.postDelayed({ kontext?.let { starten(it) } }, 60_000)
                }

                override fun onSdkShutDown() {
                    sdkZustand = "beendet"
                    geaendert()
                }
            })
        } catch (e: Exception) {
            sdkZustand = "Fehler beim Start: ${e.message}"
            log(sdkZustand)
            ciq = null
        }
    }

    fun beenden() {
        val c = ciq ?: return
        val k = kontext ?: return
        try { c.unregisterAllForEvents() } catch (_: Exception) {}
        try { c.shutdown(k) } catch (_: Exception) {}
        ciq = null
        geraete.clear()
        zustaende.clear()
    }

    private fun geraeteAnmelden() {
        val c = ciq ?: return
        val liste = try { c.knownDevices ?: emptyList() } catch (e: Exception) {
            log("Geräte nicht lesbar: ${e.message}")
            return
        }
        if (liste.isEmpty()) log("Keine Uhr in Garmin Connect gekoppelt")
        for (g in liste) {
            geraete[g.deviceIdentifier] = g
            try {
                zustaende[g.deviceIdentifier] = c.getDeviceStatus(g)
            } catch (_: Exception) {}
            try {
                c.registerForDeviceEvents(g) { d, s ->
                    val alt = zustaende[d.deviceIdentifier]
                    zustaende[d.deviceIdentifier] = s
                    if (alt != s) log("${name(d)}: ${zustandText(s)}")
                    if (s == IQDevice.IQDeviceStatus.CONNECTED) werteSenden(erzwingen = true)
                }
                c.registerForAppEvents(g, app, object : ConnectIQ.IQApplicationEventListener {
                    override fun onMessageReceived(
                        device: IQDevice?, iqApp: IQApp?, message: MutableList<Any>?,
                        status: ConnectIQ.IQMessageStatus?
                    ) {
                        if (status != ConnectIQ.IQMessageStatus.SUCCESS) {
                            log("Nachricht von der Uhr fehlerhaft: $status")
                            return
                        }
                        message?.forEach { empfangen(it) }
                    }
                })
                c.getApplicationInfo(APP_ID, g, object : ConnectIQ.IQApplicationInfoListener {
                    override fun onApplicationInfoReceived(a: IQApp?) {
                        log("Garmin Connect kennt die Uhr-App")
                    }

                    override fun onApplicationNotInstalled(id: String?) {
                        // Bei selbst aufgespielten Apps normal – Nachrichten können trotzdem gehen
                        log("Garmin Connect meldet die Uhr-App als „nicht installiert“ (bei selbst aufgespielten Apps üblich)")
                    }
                })
            } catch (e: Exception) {
                log("Anmelden bei ${name(g)} fehlgeschlagen: ${e.message}")
            }
        }
        geaendert()
    }

    // ------------------------------------------------------------------ Nachrichten

    private fun empfangen(m: Any?) {
        letzteNachricht = System.currentTimeMillis()
        val map = m as? Map<*, *>
        when (map?.get("t")) {
            "eintraege" -> {
                gewichtPruefen(map["gewicht"])
                eintraegeAnnehmen(map["e"] as? List<*> ?: emptyList<Any>())
            }
            "hallo" -> { log("Uhr meldet sich"); werteSenden(erzwingen = true) }
            "pong" -> log("Antwort von der Uhr auf Test ${map["n"]} ✓")
            else -> log("Nachricht von der Uhr: $m")
        }
    }

    /** Gewicht aus dem Garmin-Profil der Uhr: ist es neu, an den Grundumsatz erinnern */
    private fun gewichtPruefen(o: Any?) {
        val neu = UhrLogik.gewicht(o) ?: return
        val alt = Speicher.gewicht()
        if (alt == neu) return
        Speicher.gewichtSetzen(neu)
        if (UhrLogik.gewichtNeu(alt, neu)) {
            log("Neues Gewicht von der Uhr: ${Hinweis.kg(neu)} kg")
            kontext?.let { Hinweis.neuesGewicht(it, neu) }
        }
    }

    /** Warteschlange der Uhr: aufnehmen, bestätigen (mit den neuen Tageswerten), an Google weitergeben */
    private fun eintraegeAnnehmen(liste: List<*>) {
        val jetzt = UhrLogik.jetztIso()
        val ok = mutableListOf<String>()
        var neu = 0
        for (x in liste) {
            val e = UhrLogik.eintragAusUhr(x as? Map<*, *> ?: continue, jetzt) ?: continue
            if (Speicher.aufnehmen(e)) {
                neu++
                log((if (UhrLogik.istGeloescht(e)) "Von der Uhr gelöscht: " else "Von der Uhr: ") +
                    e.optString("text", e.optString("id")) + (if (e.has("ml")) " ${e.optInt("ml")} ml" else ""))
            }
            ok.add(e.optString("id"))
        }
        if (liste.isEmpty()) log("Uhr fragt nach den Tageswerten")
        if (Speicher.basis() == null) log("Noch keine Tageswerte: bitte die App Bauchtagebuch einmal öffnen")
        werteSenden(ok, erzwingen = true)
        if (neu > 0) {
            Weiterleitung.anstossen()
            beiEingang?.invoke()
        }
    }

    /**
     * Tageswerte an die Uhr: Grundlage aus der Web-App + noch nicht übernommene Uhr-Einträge.
     * Ohne Grundlage (Web-App noch nie in dieser App geöffnet) nichts senden und nichts bestätigen –
     * dann zählt die Uhr selbst weiter und schickt ihre Einträge wie bisher an Google.
     */
    fun werteSenden(ok: List<String> = emptyList(), erzwingen: Boolean = false) {
        haupt.post {
            val basis = Speicher.basis() ?: return@post
            val w = UhrLogik.werte(basis, Speicher.eingang(), LocalDate.now())
            val text = w.toString()
            if (!erzwingen && ok.isEmpty() && text == zuletztGesendet) return@post
            zuletztGesendet = text
            if (ok.isNotEmpty()) w["ok"] = ok
            senden(w) { erfolg ->
                if (erfolg && ok.isNotEmpty()) log("${ok.size} Eintrag/Einträge der Uhr bestätigt")
                else if (erfolg) log("Tageswerte an die Uhr: ${w["kcal"]} kcal, ${w["ml"]} ml")
            }
        }
    }

    private fun name(d: IQDevice): String = d.friendlyName?.takeIf { it.isNotBlank() } ?: "Uhr"

    /** Nachricht an alle verbundenen Uhren senden */
    fun senden(nachricht: Map<String, Any>, fertig: ((Boolean) -> Unit)? = null) {
        val c = ciq
        if (c == null) { log("Senden nicht möglich: $sdkZustand"); fertig?.invoke(false); return }
        val verbunden = geraete.values.filter { zustaende[it.deviceIdentifier] == IQDevice.IQDeviceStatus.CONNECTED }
        if (verbunden.isEmpty()) { log("Keine Uhr verbunden – nichts gesendet"); fertig?.invoke(false); return }
        for (g in verbunden) {
            try {
                c.sendMessage(g, app, nachricht) { _, _, s ->
                    val ok = s == ConnectIQ.IQMessageStatus.SUCCESS
                    if (!ok) log("Senden an ${name(g)} fehlgeschlagen: $s")
                    fertig?.invoke(ok)
                }
            } catch (e: Exception) {
                log("Senden fehlgeschlagen: ${e.message}")
                fertig?.invoke(false)
            }
        }
    }

    fun testSenden() {
        pingNr++
        val n = pingNr
        log("Sende Test $n an die Uhr …")
        senden(mapOf("t" to "ping", "n" to n)) { ok -> if (ok) log("Test $n ist auf der Uhr angekommen") }
    }

    // ------------------------------------------------------------------ Anzeige

    fun geraeteText(): String {
        if (geraete.isEmpty()) return "keine Uhr bekannt"
        return geraete.values.joinToString("\n") { "${name(it)}: ${zustandText(zustaende[it.deviceIdentifier])}" }
    }

    private fun zustandText(s: IQDevice.IQDeviceStatus?) = when (s) {
        IQDevice.IQDeviceStatus.CONNECTED -> "verbunden"
        IQDevice.IQDeviceStatus.NOT_CONNECTED -> "nicht verbunden"
        IQDevice.IQDeviceStatus.NOT_PAIRED -> "nicht gekoppelt"
        else -> "unbekannt"
    }

    fun protokollText(): String = synchronized(protokoll) { protokoll.joinToString("\n") }

    fun log(text: String) {
        val zeit = SimpleDateFormat("HH:mm:ss", Locale.GERMANY).format(Date())
        synchronized(protokoll) {
            protokoll.addFirst("$zeit  $text")
            while (protokoll.size > 60) protokoll.removeLast()
        }
        geaendert()
    }

    fun beobachten(f: () -> Unit) { hoerer.add(f) }
    fun nichtMehrBeobachten(f: () -> Unit) { hoerer.remove(f) }

    private fun geaendert() {
        haupt.post { hoerer.toList().forEach { it() } }
    }
}
