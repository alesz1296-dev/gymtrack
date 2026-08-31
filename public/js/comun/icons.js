/* Iconos SVG propios. Se dibujan con el color del texto que los rodea,
   por lo que funcionan igual en tema claro y oscuro sin duplicarlos.
   No dependen de ninguna librería externa, que la política de
   seguridad del servidor no permitiría cargar. */

const paths = {
  panel: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  atletas:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 4.8"/><path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6"/>',
  invitaciones:
    '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 8.5 12 14l9.5-5.5"/>',
  ejercicios:
    '<path d="M4 9v6"/><path d="M7 6.5v11"/><path d="M17 6.5v11"/><path d="M20 9v6"/><path d="M7 12h10"/>',
  rutinas:
    '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M9 3.5V2.8h6v.7"/><path d="M8.5 9.5h7"/><path d="M8.5 13h7"/><path d="M8.5 16.5h4"/>',
  nutricion:
    '<path d="M12 7.5c0-2.2 1.7-4 3.9-4 .2 2.2-1.5 4-3.9 4z"/><path d="M12 7.5c-2.6 0-4.7 1.6-5.5 4-1.1 3.3.6 8.3 3 8.3 1 0 1.6-.6 2.5-.6s1.5.6 2.5.6c2.4 0 4.1-5 3-8.3-.8-2.4-2.9-4-5.5-4z"/>',
  /* Cubiertos: la biblioteca de alimentos, frente a la manzana que ya
     representa el plan de nutrición. Se distinguen de un vistazo en el menú. */
  alimentos:
    '<path d="M5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7.5 3v5"/><path d="M7.5 10.5V21"/><path d="M17.5 3c-1.6 1.6-2.5 3.7-2.5 6 0 1.7 1.1 2.8 2.5 2.8V21"/>',
  checkins:
    '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M9 3.5V2.8h6v.7"/><path d="m8.8 12.5 2.2 2.2 4.2-4.4"/>',
  mensajes:
    '<path d="M20.5 11.5a7.9 7.9 0 0 1-8.5 7.9 9 9 0 0 1-2.6-.4L4.5 20.5l1.5-4.4a7.7 7.7 0 0 1-1.5-4.6A7.9 7.9 0 0 1 12.5 3.5a7.9 7.9 0 0 1 8 8z"/>',
  notificaciones:
    '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>' + '<path d="M9.5 21h5"/>',
  perfil: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  historial:
    '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/><path d="M12 7.5V12l3 2"/>',
  progreso: '<path d="M3.5 17.5 9 11l4 3.5 7.5-8"/><path d="M15.5 6.5h5v5"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  cerrar: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  mas: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  /* Círculo central y los ocho rayos, en pares opuestos. */
  sol:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2.5v2"/><path d="M12 19.5v2"/>' +
    '<path d="M2.5 12h2"/><path d="M19.5 12h2"/>' +
    '<path d="m5.2 5.2 1.4 1.4"/><path d="m17.4 17.4 1.4 1.4"/>' +
    '<path d="m18.8 5.2-1.4 1.4"/><path d="m6.6 17.4-1.4 1.4"/>',
  luna: '<path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5z"/>',
  salir:
    '<path d="M9.5 20.5h-4a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4"/><path d="m15.5 16.5 4-4.5-4-4.5"/><path d="M19.5 12h-11"/>',
  pesa: '<path d="M4 9v6"/><path d="M7 6.5v11"/><path d="M17 6.5v11"/><path d="M20 9v6"/><path d="M7 12h10"/>',
  chequeo: '<path d="m5 13 4.5 4.5L19 7"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  agregar: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  basura:
    '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/>' +
    '<path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>' +
    '<path d="M10 11v6"/><path d="M14 11v6"/>',
  /* Dos hojas superpuestas: se usa para el día que repite a otro. */
  copiar:
    '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/>' +
    '<path d="M15 6.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v6.5A2.5 2.5 0 0 0 6 15h.5"/>',
  calendario:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/>' +
    '<path d="M3.5 10h17"/><path d="M8 3.5V6"/><path d="M16 3.5V6"/>',
  anterior: '<path d="m14.5 5-7 7 7 7"/>',
  siguiente: '<path d="m9.5 5 7 7-7 7"/>',
  deshacer: '<path d="M3.5 8.5h11a5 5 0 0 1 0 10h-6"/><path d="M7 4.5 3 8.5l4 4"/>',
};

/* Devuelve el SVG del icono. `size` permite ajustarlo cuando el CSS
   no basta, por ejemplo dentro de un texto en línea. */
export function icon(name, size) {
  const path = paths[name];
  if (!path) return '';
  const dimension = size ? ` width="${size}" height="${size}"` : '';
  return `<svg${dimension} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
