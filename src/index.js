export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ============================================================
    // API DEL DASHBOARD
    // ============================================================
    // El enlace real de Dropbox queda guardado en Cloudflare
    // mediante la variable secreta DROPBOX_JSON_URL.
    // El navegador solamente consulta /api/datos.
    // ============================================================

    if (url.pathname === "/api/datos") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return respuestaJSON(
          {
            error: "Método no permitido"
          },
          405,
          {
            Allow: "GET, HEAD"
          }
        );
      }

      if (!env.DROPBOX_JSON_URL) {
        return respuestaJSON(
          {
            error: "Falta configurar DROPBOX_JSON_URL"
          },
          500
        );
      }

      try {
        const cache = caches.default;

        const cacheKey = new Request(
          url.origin + "/api/datos",
          {
            method: "GET"
          }
        );

        // Buscar primero una copia guardada en caché.
        if (request.method === "GET") {
          const respuestaGuardada = await cache.match(cacheKey);

          if (respuestaGuardada) {
            return respuestaGuardada;
          }
        }

        // Obtener el JSON desde Dropbox.
        const respuestaDropbox = await fetch(
          env.DROPBOX_JSON_URL,
          {
            method: request.method,
            headers: {
              Accept: "application/json,text/plain,*/*"
            },
            redirect: "follow"
          }
        );

        if (!respuestaDropbox.ok) {
          return respuestaJSON(
            {
              error: "No fue posible obtener los datos desde Dropbox",
              estadoDropbox: respuestaDropbox.status,
              detalle: respuestaDropbox.statusText
            },
            502
          );
        }

        const headers = new Headers();

        headers.set(
          "Content-Type",
          "application/json; charset=utf-8"
        );

        // Caché de 5 minutos.
        headers.set(
          "Cache-Control",
          "public, max-age=300, s-maxage=300"
        );

        headers.set(
          "X-Content-Type-Options",
          "nosniff"
        );

        headers.set(
          "Referrer-Policy",
          "no-referrer"
        );

        const respuesta = new Response(
          respuestaDropbox.body,
          {
            status: 200,
            headers
          }
        );

        // Guardar una copia en caché.
        if (request.method === "GET") {
          ctx.waitUntil(
            cache.put(
              cacheKey,
              respuesta.clone()
            )
          );
        }

        return respuesta;
      } catch (error) {
        return respuestaJSON(
          {
            error: "Error al consultar el origen de datos",
            detalle:
              error instanceof Error
                ? error.message
                : String(error)
          },
          502
        );
      }
    }

    // ============================================================
    // ARCHIVOS ESTÁTICOS
    // ============================================================
    // Sirve el index.html y los demás archivos de la carpeta public.
    // ============================================================

    return env.ASSETS.fetch(request);
  }
};


// ============================================================
// RESPUESTA JSON
// ============================================================

function respuestaJSON(
  contenido,
  estado = 200,
  headersExtra = {}
) {
  return new Response(
    JSON.stringify(contenido),
    {
      status: estado,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headersExtra
      }
    }
  );
}
