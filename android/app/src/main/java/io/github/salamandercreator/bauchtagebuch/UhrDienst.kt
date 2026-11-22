package io.github.salamandercreator.bauchtagebuch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Vordergrund-Dienst (mit dauerhafter Benachrichtigung), damit Android die Uhr-Verbindung
 * nicht beendet, wenn die App geschlossen ist.
 */
class UhrDienst : Service() {

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(KANAL, "Uhr-Verbindung", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Hält die Verbindung zur Garmin-Uhr, auch ohne Internet"
                setShowBadge(false)
            }
        )
        val oeffnen = PendingIntent.getActivity(
            this, 0, Intent(this, UhrStatusActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(this, KANAL)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("Bauchtagebuch ↔ Uhr")
            .setContentText("Verbindung zur Uhr aktiv")
            .setContentIntent(oeffnen)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(1, n)
        }
        Uhr.starten(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        Uhr.beenden()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val KANAL = "uhr"

        fun starten(ctx: Context) {
            try {
                ctx.startForegroundService(Intent(ctx, UhrDienst::class.java))
            } catch (e: Exception) {
                Uhr.log("Dienst nicht gestartet: ${e.message}")
            }
        }
    }
}
