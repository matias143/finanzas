package cl.matias.finanzasnotif

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Envía cada notificación a tu Apps Script. Si no hay internet, Android lo reintenta solo
 * (incluso después de reiniciar el teléfono), así no se pierde ninguna.
 */
class Envio(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val ajustes = Ajustes(applicationContext)
        if (!ajustes.configurado) return Result.failure()
        val id = inputData.getString("id") ?: ""
        val cuerpo = JSONObject()
            .put("token", ajustes.clave)
            .put("accion", "notif")
            .put("app", inputData.getString("app"))
            .put("titulo", inputData.getString("titulo"))
            .put("texto", inputData.getString("texto"))
        return try {
            val (codigo, respuesta) = post(ajustes.url, cuerpo.toString())
            when {
                codigo in 200..399 && !respuesta.contains("\"error\"") -> {
                    ajustes.anotar(id, "", "", "enviada ✓")
                    Result.success()
                }
                respuesta.contains("Clave incorrecta") -> {
                    ajustes.anotar(id, "", "", "error: clave incorrecta")
                    Result.failure()
                }
                else -> {
                    ajustes.anotar(id, "", "", "reintentando (HTTP $codigo)")
                    Result.retry()
                }
            }
        } catch (e: Exception) {
            ajustes.anotar(id, "", "", "sin conexión, reintentando")
            Result.retry()
        }
    }

    companion object {
        fun encolar(context: Context, id: String, app: String, titulo: String, texto: String) {
            val trabajo = OneTimeWorkRequestBuilder<Envio>()
                .setInputData(workDataOf("id" to id, "app" to app, "titulo" to titulo, "texto" to texto))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueue(trabajo)
        }

        /**
         * POST a Apps Script. Google responde con una redirección (302) a la respuesta;
         * se sigue a mano con GET, que es como funciona Apps Script.
         */
        fun post(url: String, cuerpo: String): Pair<Int, String> {
            val c = URL(url).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 20000
            c.readTimeout = 30000
            c.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
            c.outputStream.use { it.write(cuerpo.toByteArray(Charsets.UTF_8)) }
            val codigo = c.responseCode
            if (codigo in 300..399) {
                val destino = c.getHeaderField("Location") ?: return codigo to ""
                c.disconnect()
                val g = URL(destino).openConnection() as HttpURLConnection
                g.connectTimeout = 20000
                g.readTimeout = 30000
                val texto = g.inputStream.bufferedReader().use { it.readText() }
                return g.responseCode to texto
            }
            val texto = (if (codigo < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return codigo to texto
        }
    }
}
