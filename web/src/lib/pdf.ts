// Lee tablas de un PDF (ej. "Resumen de cuenta" de Mercado Pago) y las convierte en filas,
// igual que si vinieran de un Excel. Se carga solo cuando se importa un PDF.

type Celda = string
interface Trozo {
  x: number
  y: number
  fin: number
  texto: string
}

const ES_FECHA = /^\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?(\s+\d{1,2}:\d{2}(:\d{2})?)?$/
const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Encabezado de la tabla de movimientos: una línea con "fecha" y "monto"/"cargo"/"abono". */
const esEncabezado = (celdas: Trozo[]) =>
  celdas.some((c) => /fecha|date/.test(normal(c.texto))) && celdas.some((c) => /monto|amount|cargo|abono|importe/.test(normal(c.texto)))

export async function leerPdf(buf: ArrayBuffer): Promise<Celda[][]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise

  const salida: Celda[][] = []
  let encabezado: Trozo[] | null = null

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const contenido = await pagina.getTextContent()
    const trozos: Trozo[] = []
    for (const it of contenido.items) {
      if (!('str' in it) || !it.str.trim()) continue
      trozos.push({ x: it.transform[4], y: it.transform[5], fin: it.transform[4] + it.width, texto: it.str.trim() })
    }

    // 1) Agrupar en líneas por altura (y), de arriba hacia abajo
    trozos.sort((a, b) => b.y - a.y || a.x - b.x)
    const lineas: { y: number; celdas: Trozo[] }[] = []
    for (const t of trozos) {
      const l = lineas.find((x) => Math.abs(x.y - t.y) < 2.5)
      if (l) l.celdas.push(t)
      else lineas.push({ y: t.y, celdas: [t] })
    }
    for (const l of lineas) {
      l.celdas.sort((a, b) => a.x - b.x)
      // Unir trozos pegados (una misma celda partida en varias piezas)
      const unidas: Trozo[] = []
      for (const c of l.celdas) {
        const u = unidas[unidas.length - 1]
        if (u && c.x - u.fin < 3) {
          u.texto += (c.x - u.fin > 0.5 ? ' ' : '') + c.texto
          u.fin = c.fin
        } else unidas.push({ ...c })
      }
      l.celdas = unidas
    }

    // 2) Ubicar el encabezado de la tabla en esta página
    const iEnc = lineas.findIndex((l) => esEncabezado(l.celdas))
    if (iEnc >= 0) {
      if (!encabezado) {
        // Lo que está antes (datos del titular, período…) se entrega como cabecera
        for (const l of lineas.slice(0, iEnc)) salida.push(l.celdas.map((c) => c.texto))
        encabezado = lineas[iEnc].celdas
        salida.push(encabezado.map((c) => c.texto))
      }
    }
    if (!encabezado) {
      for (const l of lineas) salida.push(l.celdas.map((c) => c.texto))
      continue
    }
    const cols = encabezado
    const columna = (x: number) => {
      let j = 0
      for (let k = 0; k < cols.length; k++) if (cols[k].x <= x + 8) j = k
      return j
    }

    // 3) Cada fila empieza con una fecha en la primera columna; las líneas sueltas
    //    (nombres partidos en dos renglones) se asignan a la fila más cercana.
    const cuerpo = lineas.slice(iEnc >= 0 ? iEnc + 1 : 0)
    const anclas = cuerpo.filter((l) => ES_FECHA.test(l.celdas[0]?.texto || '') && columna(l.celdas[0].x) === 0)
    if (!anclas.length) continue
    const filas = anclas.map(() => cols.map(() => [] as { y: number; t: string }[]))
    for (const l of cuerpo) {
      if (esEncabezado(l.celdas)) continue
      let mejor = 0
      anclas.forEach((a, i) => {
        if (Math.abs(a.y - l.y) < Math.abs(anclas[mejor].y - l.y)) mejor = i
      })
      if (Math.abs(anclas[mejor].y - l.y) > 30) continue // pies de página, totales
      for (const c of l.celdas) filas[mejor][columna(c.x)].push({ y: l.y, t: c.texto })
    }
    for (const f of filas) salida.push(f.map((partes) => partes.sort((a, b) => b.y - a.y).map((p) => p.t).join(' ')))
  }
  return salida
}
