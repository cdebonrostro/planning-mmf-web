# Planning MMF · edición estática

Planificador semanal que se ejecuta en el navegador. La edición pública incluye perfiles de ejemplo identificados como P01–P08. Los nombres o alias y las competencias se ajustan en **Perfiles locales y competencias**.

## Publicar en GitHub Pages

1. Crea un repositorio **Public** dedicado a esta edición. Sube los archivos de esta carpeta directamente a la raíz de `main`, incluido `index.html`.
2. En **Settings → Pages**, elige **Deploy from a branch → main → /(root) → Save**. GitHub muestra la URL cuando termina la publicación.
3. Abre la URL en el ordenador. En iPhone, abre la URL en Safari y pulsa **Compartir → Añadir a pantalla de inicio**. Activa **Abrir como app web** si aparece y pulsa **Añadir**.

La aplicación guarda el trabajo en IndexedDB del navegador. El sitio público distribuye el planificador. Los perfiles que configures y los plannings se quedan en el dispositivo. Tras la primera visita se pueden volver a abrir los recursos de la aplicación sin conexión.

## Llevar los datos a otro dispositivo

- Pulsa **Compartir copia completa** y elige **Guardar en Archivos → iCloud Drive**. Si el navegador no muestra la opción de compartir archivos, pulsa **Descargar copia completa (JSON)** y mueve el archivo a iCloud Drive desde Archivos o Finder.
- En el otro dispositivo, abre Planning MMF, pulsa **Recuperar copia JSON** y selecciona ese archivo. La app indica las coincidencias y pide confirmación antes de sustituirlas. El archivo conserva perfiles, configuraciones, borradores, definitivos, revisiones y rotaciones.
- Guarda una copia antes de borrar datos del navegador, cambiar la URL de publicación o pasar de Safari a la app de pantalla de inicio. Safari y la app instalada pueden mantener almacenes separados. Conserva el JSON en una ubicación privada.
- Descarga o comparte el PDF y el CSV desde el planning semanal. Las opciones de compartir aparecen cuando el navegador admite el tipo de archivo.

Para copias antiguas que usaban nombres en las rotaciones o turnos, configura primero los alias que aparecían en la copia en sus perfiles P01–P08 correspondientes.
