package cl.matias.finanzasnotif

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import kotlin.concurrent.thread

/** Pantalla única: configuración, permisos y últimas notificaciones capturadas. */
class MainActivity : Activity() {

    private lateinit var ajustes: Ajustes
    private lateinit var estado: TextView
    private lateinit var lista: LinearLayout
    private val verde = Color.parseColor("#2f9e6e")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ajustes = Ajustes(this)

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(28))
        }
        setContentView(ScrollView(this).apply { addView(raiz) })

        raiz.addView(texto("Finanzas Notif", 24f, negrita = true))
        raiz.addView(texto("Envía a tu planilla las notificaciones de compras y transferencias del banco.", 14f, gris = true).margen(abajo = 16))

        estado = texto("", 15f).margen(abajo = 8)
        raiz.addView(estado)
        raiz.addView(boton("Dar acceso a notificaciones") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })
        raiz.addView(boton("Que la batería no la detenga", secundario = true) { pedirBateria() })
        raiz.addView(boton("Reconectar servicio", secundario = true) {
            Vigia.reconectar(this, forzar = true)
            aviso("Reconectando… vuelve a abrir esta pantalla en unos segundos")
            estado.postDelayed({ pintar() }, 3000)
        })
        raiz.addView(texto("En Xiaomi/Redmi/POCO: en la ficha de la app activa también \"Inicio automático\", y en Recientes deja la app bloqueada con el candado.", 12f, gris = true).margen(arriba = 8, abajo = 20))

        raiz.addView(titulo("Conexión"))
        val url = campo("URL de Apps Script (termina en /exec)", ajustes.url)
        val clave = campo("Clave", ajustes.clave, secreto = true)
        val filtro = campo("Apps a escuchar", ajustes.filtro)
        raiz.addView(url)
        raiz.addView(clave)
        raiz.addView(filtro)
        raiz.addView(texto("Separa nombres de apps con | (ej: santander|mercado ?pago).", 12f, gris = true).margen(abajo = 8))
        raiz.addView(boton("Guardar y probar conexión") {
            ajustes.url = url.text.toString()
            ajustes.clave = clave.text.toString()
            ajustes.filtro = filtro.text.toString()
            probar()
        }.margen(abajo = 20))

        raiz.addView(titulo("Últimas notificaciones"))
        lista = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        raiz.addView(lista)
    }

    override fun onResume() {
        super.onResume()
        Vigia.programar(this)
        if (tieneAcceso()) Vigia.reconectar(this, forzar = false)
        pintar()
    }

    private fun hace(ms: Long): String {
        if (ms == 0L) return "nunca"
        val min = (System.currentTimeMillis() - ms) / 60000
        return when {
            min < 1 -> "recién"
            min < 60 -> "hace $min min"
            min < 48 * 60 -> "hace ${min / 60} h"
            else -> "hace ${min / (24 * 60)} días"
        }
    }

    private fun pintar() {
        val permiso = tieneAcceso()
        val bateria = (getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)
        estado.text = buildString {
            append(if (permiso) "✓ Acceso a notificaciones activo" else "✗ Falta dar acceso a notificaciones")
            append("\n")
            append(if (bateria) "✓ Sin restricción de batería" else "• La batería podría pausarla (recomendado quitar)")
            append("\n")
            append(if (ajustes.configurado) "✓ Conexión configurada" else "✗ Falta la URL y la clave")
            append("\n\n")
            append("Servicio conectado: ${hace(ajustes.ultimaConexion)}\n")
            append("Última notificación vista (de cualquier app): ${hace(ajustes.ultimaSenal)}")
        }
        estado.setTextColor(if (permiso && ajustes.configurado) verde else Color.parseColor("#d9604a"))

        lista.removeAllViews()
        val h = ajustes.historial()
        if (h.length() == 0) {
            lista.addView(texto("Aún no llega ninguna. Aparecerán aquí cuando el banco te notifique un movimiento.", 13f, gris = true))
        }
        for (i in 0 until h.length()) {
            val o = h.getJSONObject(i)
            lista.addView(texto("${o.optString("hora")} · ${o.optString("app")} · ${o.optString("estado")}", 12f, gris = true).margen(arriba = 10))
            lista.addView(texto(o.optString("texto"), 14f))
        }
    }

    private fun tieneAcceso() = Vigia.tieneAcceso(this)

    private fun pedirBateria() {
        // Abre la ficha de la app en Ajustes: ahí está "Batería" → "Sin restricciones".
        // (Se evita el permiso de pedirlo directo, que hace más sospechosa la app para Play Protect.)
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            aviso("Entra a Batería y elige \"Sin restricciones\"")
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun probar() {
        if (!ajustes.configurado) {
            aviso("Revisa la URL (debe empezar con https://) y la clave")
            pintar()
            return
        }
        aviso("Probando…")
        thread {
            val msg = try {
                val (codigo, r) = Envio.post(ajustes.url, JSONObject().put("token", ajustes.clave).put("accion", "ping").toString())
                when {
                    r.contains("\"ok\":true") -> "Conexión correcta ✓"
                    r.contains("Clave incorrecta") -> "La clave no es correcta"
                    else -> "Respuesta inesperada (HTTP $codigo). ¿La URL termina en /exec?"
                }
            } catch (e: Exception) {
                "No se pudo conectar: ${e.message}"
            }
            runOnUiThread {
                aviso(msg)
                pintar()
            }
        }
    }

    // ---------- piezas de interfaz ----------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun aviso(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    private fun texto(s: String, tam: Float, negrita: Boolean = false, gris: Boolean = false) = TextView(this).apply {
        text = s
        textSize = tam
        if (negrita) typeface = Typeface.DEFAULT_BOLD
        if (gris) alpha = 0.65f
    }

    private fun titulo(s: String) = texto(s, 16f, negrita = true).margen(abajo = 6)

    private fun campo(pista: String, valor: String, secreto: Boolean = false) = EditText(this).apply {
        hint = pista
        setText(valor)
        isSingleLine = true
        inputType = if (secreto) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
    }

    private fun boton(s: String, secundario: Boolean = false, accion: () -> Unit) = Button(this).apply {
        text = s
        isAllCaps = false
        textSize = 15f
        gravity = Gravity.CENTER
        setTextColor(if (secundario) verde else Color.WHITE)
        background = GradientDrawable().apply {
            cornerRadius = dp(12).toFloat()
            if (secundario) setStroke(dp(1), verde) else setColor(verde)
        }
        setOnClickListener { accion() }
    }.margen(arriba = 8)

    private fun <T : View> T.margen(arriba: Int = 0, abajo: Int = 0): T {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(arriba)
            bottomMargin = dp(abajo)
        }
        return this
    }
}
