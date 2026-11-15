package cl.matias.finanzasnotif

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Cada 15 minutos revisa que el servicio que lee notificaciones siga conectado
 * y, si Android lo durmió, le pide que lo vuelva a conectar.
 */
class Vigia(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        if (tieneAcceso(applicationContext)) reconectar(applicationContext, forzar = false)
        return Result.success()
    }

    companion object {
        fun programar(context: Context) {
            val trabajo = PeriodicWorkRequestBuilder<Vigia>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("vigia", ExistingPeriodicWorkPolicy.KEEP, trabajo)
        }

        fun tieneAcceso(context: Context): Boolean {
            val activos = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
            val yo = ComponentName(context, Escucha::class.java)
            return activos.split(":").any { ComponentName.unflattenFromString(it) == yo }
        }

        /**
         * Pide a Android reconectar el servicio. Con forzar=true además lo apaga y prende,
         * que es lo que destraba los casos en que Android lo deja colgado.
         */
        fun reconectar(context: Context, forzar: Boolean) {
            val c = ComponentName(context, Escucha::class.java)
            if (forzar) {
                val pm = context.packageManager
                pm.setComponentEnabledSetting(c, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
                pm.setComponentEnabledSetting(c, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            }
            try {
                NotificationListenerService.requestRebind(c)
            } catch (e: Exception) {
                // Si Android no lo permite en este momento, se intenta en la próxima revisión.
            }
        }
    }
}
