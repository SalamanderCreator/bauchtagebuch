package io.github.salamandercreator.bauchtagebuch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Nach dem Einschalten des Handys und nach einem App-Update den Uhr-Dienst wieder starten */
class StartEmpfaenger : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            UhrDienst.starten(context)
        }
    }
}
