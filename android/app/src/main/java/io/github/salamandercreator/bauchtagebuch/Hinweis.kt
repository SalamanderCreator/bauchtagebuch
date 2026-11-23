package io.github.salamandercreator.bauchtagebuch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** Benachrichtigungen für die Nutzerin (nicht die dauerhafte der Uhr-Verbindung) */
object Hinweis {

    const val ZIEL = "ziel"
    const val GRUNDUMSATZ = "grundumsatz"
    private const val KANAL = "hinweise"
    private const val NR_GEWICHT = 2

    fun kg(gramm: Int): String = String.format(java.util.Locale.GERMANY, "%.1f", gramm / 1000.0)

    /** „Neues Gewicht … – bitte den neuen Grundumsatz eintragen“; Tippen öffnet das Feld in den Einstellungen */
    fun neuesGewicht(ctx: Context, gramm: Int) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(KANAL, "Hinweise", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "z. B. neuen Grundumsatz eintragen, wenn sich das Gewicht geändert hat"
            }
        )
        val oeffnen = PendingIntent.getActivity(
            ctx, NR_GEWICHT,
            Intent(ctx, MainActivity::class.java).putExtra(ZIEL, GRUNDUMSATZ)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val text = "Neues Gewicht ${kg(gramm)} kg – bitte den neuen Grundumsatz aus Garmin Connect eintragen."
        val n = Notification.Builder(ctx, KANAL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Grundumsatz aktualisieren")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(oeffnen)
            .setAutoCancel(true)
            .build()
        try { nm.notify(NR_GEWICHT, n) } catch (_: SecurityException) { /* Benachrichtigungen nicht erlaubt */ }
    }
}
