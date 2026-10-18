package cl.matias.finanzasnotif

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.security.MessageDigest

/** Servicio que Android llama con cada notificación nueva. */
class Escucha : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val ajustes = Ajustes(this)
        if (!ajustes.configurado) return

        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return

        val app = nombreApp(sbn.packageName)
        val filtro = try {
            Regex(ajustes.filtro, RegexOption.IGNORE_CASE)
        } catch (e: Exception) {
            Regex(Ajustes.FILTRO_POR_DEFECTO, RegexOption.IGNORE_CASE)
        }
        if (!filtro.containsMatchIn(app) && !filtro.containsMatchIn(sbn.packageName)) return

        val ex = n.extras
        val titulo = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val texto = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (texto.isBlank()) return

        val huella = sha1("$app|$titulo|$texto")
        if (!ajustes.esNueva(huella)) return

        ajustes.anotar(huella, app, texto, "en cola")
        Envio.encolar(this, huella, app, titulo, texto)
    }

    private fun nombreApp(paquete: String): String = try {
        val pm = packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(paquete, PackageManager.ApplicationInfoFlags.of(0))).toString()
    } catch (e: Exception) {
        try {
            @Suppress("DEPRECATION")
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(paquete, 0)).toString()
        } catch (e2: Exception) {
            paquete
        }
    }

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(20)
}
