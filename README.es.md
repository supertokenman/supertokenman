# SuperTokenMan

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · Español

Una app para Mac alrededor de Claude Code: varios paneles lado a lado, aprobación de herramientas en la
misma ventana y un medidor que muestra cuánto cuesta una sesión y qué dejó la app fuera del contexto.
Ejecuta Claude Code a través del Agent SDK con tu propio inicio de sesión, configuración, plugins y hooks.

Sitio: https://supertokenman.com

## Descarga

Las versiones firmadas y notarizadas para Apple silicon e Intel están en
[Releases](https://github.com/supertokenman/supertokenman/releases), cada una con un `SHA256SUMS`. Para verificar una descarga:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
codesign --verify --deep --strict --verbose=2 /Applications/SuperTokenMan.app
spctl -a -vv /Applications/SuperTokenMan.app      # "source=Notarized Developer ID"
```

## Compilar desde el código

```bash
cd app && npm install && npm start
```

Detalles, pruebas y el script de instalación en Mac: [app/README.md](app/README.md).

## Qué hay en este repositorio

| Carpeta | Qué |
|---|---|
| `app/` | La app Electron (React, Vite, el Claude Agent SDK). |
| `token-kit/` | `tk`: los hooks de shell y el condensador que usa la app para mantener las salidas largas fuera del contexto. |
| `site/` | La landing page (estática). |
| `docs/` | Notas de marca y diseño, pasos de release, lo que quedó fuera de cada fase y por qué. |

## Privacidad y seguridad, en resumen

- Tu inicio de sesión de Claude, tus claves de API y tus contraseñas se quedan en tu Mac, en el llavero
  del sistema; los paneles reciben solo los nombres que marcas para comandos.
- Nada se publica, envía o despliega sin tu clic y una confirmación.
- Sin telemetría. Por sí sola, la app solo se conecta al endpoint de Claude Code y a la búsqueda de
  actualizaciones; todo lo demás espera a que lo actives. La lista: [docs/NETWORK.md](docs/NETWORK.md).

Para reportar un problema de seguridad: [SECURITY.md](SECURITY.md).

## Licencia

[FSL-1.1-ALv2](LICENSE.md), © 2026 Yuji Miguel Arima. Puedes leer, auditar, compilar, modificar y usar el
código para cualquier cosa excepto un producto comercial competidor. Cada versión pasa a Apache 2.0 dos
años después de su lanzamiento.

Sin relación con Anthropic. Claude y Claude Code son marcas registradas de Anthropic, PBC.
