# Finanzas

App personal de finanzas para Android. Se instala desde el navegador como una app más. Registra gastos e ingresos, muestra KPIs y gráficos, y lee automáticamente los correos del banco.

**Costo: $0, para siempre.** No usa servidores pagados ni suscripciones:

| Pieza | Dónde vive | Costo |
|---|---|---|
| La app (React + shadcn/ui) | GitHub Pages, compilada por GitHub Actions | Gratis (repo público) |
| Tus datos | Una Google Sheet privada en tu Drive | Gratis |
| El "backend" (sincronización y lectura de correos) | Google Apps Script en tu cuenta | Gratis |
| Compras con tarjeta (opcional) | MacroDroid en tu celular | Gratis (usa 1 de 5 macros) |

> El repositorio es público, pero **solo contiene código**. Tus movimientos están en tu Google Sheet y la clave solo vive en tu celular. Nunca subas la clave ni datos al repo.

---

## Qué trae

- **Inicio**: balance del mes, tasa de ahorro, gasto diario promedio, proyección a fin de mes, comparación con el mes anterior a la misma fecha, gastos hormiga, gastos recurrentes (suscripciones) y presupuestos en alerta.
- **Gráficos**: gasto por categoría, ritmo de gasto del mes contra el mes anterior, e ingresos contra gastos de los últimos 6 meses.
- **Movimientos**: lista por día, con búsqueda y filtros. Los automáticos llevan la etiqueta *correo* o *notificación*.
- **Presupuesto**: un límite mensual por categoría, con barras de avance.
- **Ajustes**: categorías, reglas de categorización automática (por ejemplo, `lider|jumbo` va a Supermercado), cuentas y respaldo en archivo.
- Funciona **sin internet**. Los cambios se guardan en el celular y se sincronizan cuando vuelve la conexión.
- Tipos de movimiento: **Gasto**, **Ingreso** y **Traspaso**. Un traspaso es dinero entre tus propias cuentas (por ejemplo, de Santander a Mercado Pago) y no cuenta como gasto.

---

## Instalación (una sola vez, unos 15 minutos)

### 1. El backend en Google Apps Script

1. Entra a <https://script.google.com> con tu Gmail y pulsa **Nuevo proyecto**. Ponle de nombre `Finanzas`.
2. Borra el contenido de `Código.gs` y pega todo el archivo [`apps-script/Code.gs`](apps-script/Code.gs).
3. Arriba, elige la función **`configurar`** y pulsa **Ejecutar**.
   - Google pedirá permisos para Sheets, Gmail y disparadores.
   - Aparecerá el aviso "Google no verificó esta app". Es normal, porque la app es tuya. Pulsa **Configuración avanzada → Ir a Finanzas (no seguro) → Permitir**.
4. En el **Registro de ejecución** verás la **CLAVE** y el enlace a tu nueva planilla *Finanzas — datos*. Copia la clave.
5. Pulsa **Implementar → Nueva implementación**. En el engranaje elige **Aplicación web** y configura:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario** (la clave es la que protege tus datos)
6. Pulsa **Implementar** y copia la **URL de la aplicación web**, la que termina en `/exec`.

### 2. Publicar la app con GitHub Pages

1. En este repositorio, ve a **Settings → Pages**.
2. En *Source* elige **GitHub Actions**.
3. Ve a la pestaña **Actions → Publicar app → Run workflow** (o simplemente haz un `push`). Cada `push` a `main` que toque `web/` la vuelve a compilar y publicar sola.
4. En 1 o 2 minutos la app estará en: **https://matias143.github.io/finanzas/**

### 3. Instalarla en el celular

1. Abre esa dirección en **Chrome** en tu Android.
2. Toca el menú **⋮ → Instalar app** (o *Agregar a pantalla principal*).
3. Abre la app, ve a **Ajustes**, pega la **URL** y la **clave**, y toca **Guardar y sincronizar**.

Repite el paso 3 en cualquier otro dispositivo (otro celular o el navegador del PC) para ver los mismos datos.

---

## Gastos automáticos

### Correos (transferencias)

Cada 15 minutos, el script revisa tu Gmail en busca de correos de **Santander** y **Mercado Pago** sobre transferencias y pagos. Saca el monto, la contraparte y la fecha, y los registra solos. Las reglas de categorías se aplican automáticamente. Cada correo leído queda con la etiqueta `finanzas-procesado` en Gmail.

- Para revisar qué entiende de tus correos **sin guardar nada**, ejecuta la función **`probarCorreos`** en Apps Script y mira el registro.
- Los correos que no logra leer quedan en la pestaña **"Sin leer"** de tu planilla. Si alguno debería leerse, copia su texto (borrando datos personales) y pide que se ajuste la función `interpretarTexto`.
- Las búsquedas de Gmail están en `CONFIG.FUENTES`, al inicio de `Code.gs`.
- Si mejoras el lector, ejecuta **`reprocesarCorreos`**: vuelve a leer los correos ya importados y corrige esos movimientos en la app. No toca lo que agregaste a mano.
- Las transferencias de Santander se entienden por los bloques "Datos de origen" y "Datos de destino". Si tú eres el destino, es un ingreso. Si eres ambos (por ejemplo, de Santander a tu Mercado Pago), es un traspaso y no cuenta como gasto.

### Compras con tarjeta (notificaciones del celular)

Como Santander no te envía correo por las compras con tarjeta, se usan las **notificaciones push** de las apps de Santander y Mercado Pago. MacroDroid (gratis) las reenvía a tu script:

1. En las apps de Santander y Mercado Pago, activa las notificaciones de compras o movimientos si están disponibles.
2. Instala **MacroDroid** desde Play Store y crea una macro:
   - **Disparador**: *Notificación* → *Notificación recibida* → selecciona las apps **Santander** y **Mercado Pago**.
   - **Acción**: *Conectividad* → *Solicitud HTTP*:
     - Método: **POST**
     - URL: tu URL `/exec`
     - Cuerpo, tipo `text/plain`. Usa el botón de texto mágico para insertar las variables:
       ```json
       {"token":"TU_CLAVE","accion":"notif","app":"[app_name]","titulo":"[notification_title]","texto":"[notification]"}
       ```
3. Dale a MacroDroid acceso a notificaciones y quítale la optimización de batería.

Las notificaciones repetidas se descartan solas. Las que no son de dinero (promociones, por ejemplo) quedan en "Sin leer" y no ensucian tus datos.

### Importar desde Excel o CSV (Wallet, cartolas)

En **Ajustes → Importar movimientos** puedes cargar un `.xls`, `.xlsx` o `.csv`:

- **Wallet (BudgetBakers)**: se reconoce solo. Los traspasos entre cuentas, que Wallet anota dos veces, quedan como uno.
- **Cartolas de banco**: se detectan las columnas de fecha, descripción y monto (o cargo/abono).

Antes de guardar ves una vista previa, donde eliges cómo pasar las categorías y cuentas del archivo a las tuyas. Lo que ya existe en la app (mismo monto, ±2 días) se omite. Si ese movimiento existente tenía una categoría genérica, como "Transferencias", se le completa con la del archivo. Importar dos veces el mismo archivo no duplica nada.

### Plan B: a mano

Si algo no llega por correo ni por notificación, lo agregas con el botón **+**. Cuando Chile active el open banking oficial (Sistema de Finanzas Abiertas, previsto para julio de 2027), se podrá conectar el banco directamente.

---

## Modificar la app desde cualquier PC

Necesitas [Node.js](https://nodejs.org) 22 o superior (solo la primera vez en cada PC).

```bash
git clone https://github.com/matias143/finanzas.git
cd finanzas/web
npm install        # solo la primera vez
npm run dev        # abre http://localhost:5173/finanzas/ y se recarga solo al guardar
```

Edita, haz `git push`, y en 1 o 2 minutos GitHub Actions compila y publica la nueva versión. La app del celular la toma sola la próxima vez que la abras con internet. También puedes editar directo en github.com (tecla `.` abre un editor en el navegador): GitHub la compila igual.

Para revisar que compila antes de subir: `npm run build`.

**Componentes shadcn/ui:** están en `web/src/components/ui/` y son código tuyo (puedes modificarlos). Para agregar otros: `npx shadcn@latest add <componente>` dentro de `web/` (por ejemplo `npx shadcn@latest add switch`).

Las versiones de las librerías quedan fijadas en `package-lock.json`, así que nada se rompe solo con el tiempo. Actualizarlas es opcional.

Si cambias `apps-script/Code.gs`, pégalo de nuevo en script.google.com y ve a **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL no cambia.

### Estructura

```
web/                          ← la app (React + TypeScript + Tailwind + shadcn/ui)
  src/
    App.tsx                   ← barra superior, navegación y editor
    pages/                    ← una pantalla por archivo: Inicio, Movimientos, Presupuesto, Ajustes
    components/
      ui/                     ← componentes shadcn/ui (button, card, drawer, select…)
      charts.tsx              ← gráficos (Recharts)
      EditorMovimiento.tsx    ← hoja para crear/editar un movimiento
      Importador.tsx          ← vista previa al importar Excel/CSV
    lib/
      stats.ts                ← cálculo de KPIs (agrega aquí nuevos indicadores)
      store.ts                ← guardado local, sincronización y categorías por defecto
      importar.ts             ← lectura de Wallet y cartolas
      util.ts                 ← formato de pesos, fechas, reglas
      types.ts                ← tipos de datos (Movimiento, Categoria…)
    index.css                 ← tema: colores de toda la app (claro y oscuro)
  public/                     ← íconos, manifest y sw.js (funcionamiento sin internet)
apps-script/
  Code.gs                     ← backend: API, lectura de correos y notificaciones
  appsscript.json
.github/workflows/publicar.yml ← compila y publica la app en cada push
```

## Seguridad y respaldo

- Si crees que alguien vio tu clave, ejecuta **`cambiarClave`** en Apps Script y pega la nueva en Ajustes.
- Tus datos están en tu Google Sheet, que también puedes abrir y editar a mano. Además, en **Ajustes → Respaldo** puedes descargar todo en un archivo `.json`.
