package cl.matias.finanzasnotif

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Configuración y registro local, guardados en el teléfono. */
class Ajustes(context: Context) {
    private val p = context.getSharedPreferences("ajustes", Context.MODE_PRIVATE)

    var url: String
        get() = p.getString("url", "") ?: ""
        set(v) = p.edit().putString("url", v.trim()).apply()

    var clave: String
        get() = p.getString("clave", "") ?: ""
        set(v) = p.edit().putString("clave", v.trim()).apply()

    /** Expresión regular con el nombre de las apps a escuchar. */
    var filtro: String
        get() = p.getString("filtro", FILTRO_POR_DEFECTO) ?: FILTRO_POR_DEFECTO
        set(v) = p.edit().putString("filtro", v.trim().ifEmpty { FILTRO_POR_DEFECTO }).apply()

    val configurado get() = url.startsWith("https://") && clave.isNotEmpty()

    /** Evita mandar dos veces la misma notificación (Android la vuelve a publicar al actualizarla). Devuelve true si es nueva. */
    @Synchronized
    fun esNueva(huella: String): Boolean {
        val ahora = System.currentTimeMillis()
        val vistas = JSONObject(p.getString("vistas", "{}") ?: "{}")
        val limpias = JSONObject()
        vistas.keys().forEach { k -> if (ahora - vistas.getLong(k) < DOS_DIAS) limpias.put(k, vistas.getLong(k)) }
        if (limpias.has(huella)) return false
        limpias.put(huella, ahora)
        p.edit().putString("vistas", limpias.toString()).apply()
        return true
    }

    /** Últimas notificaciones capturadas, para mostrarlas en la pantalla principal. */
    @Synchronized
    fun anotar(id: String, app: String, texto: String, estado: String) {
        val lista = historial()
        var encontrada = false
        for (i in 0 until lista.length()) {
            val o = lista.getJSONObject(i)
            if (o.optString("id") == id) {
                o.put("estado", estado); encontrada = true
            }
        }
        if (!encontrada) {
            val nueva = JSONArray().put(
                JSONObject().put("id", id).put("hora", HORA.format(Date())).put("app", app).put("texto", texto.take(160)).put("estado", estado),
            )
            for (i in 0 until minOf(lista.length(), 29)) nueva.put(lista.get(i))
            p.edit().putString("historial", nueva.toString()).apply()
            return
        }
        p.edit().putString("historial", lista.toString()).apply()
    }

    fun historial(): JSONArray = JSONArray(p.getString("historial", "[]") ?: "[]")

    companion object {
        const val FILTRO_POR_DEFECTO = "santander|mercado ?pago"
        private const val DOS_DIAS = 2L * 24 * 60 * 60 * 1000
        private val HORA = SimpleDateFormat("dd/MM HH:mm", Locale("es", "CL"))
    }
}
