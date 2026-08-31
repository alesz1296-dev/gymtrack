import { currentUser, logout } from './auth.js';
import { escapeHtml } from './dom.js';
import { icon } from './icons.js';
import { themeButton } from './theme.js';
import { api } from './api.js';
import { socket } from './socket.js';

/* Cada entrada es [etiqueta, dirección, icono]. Las marcadas en
   `tabs` son las que aparecen en la barra inferior del celular;
   el resto queda en el menú deslizante. */
const menus = {
  trainer: {
    links: [
      ['Panel', '/entrenador/panel.html', 'panel'],
      ['Atletas', '/entrenador/atletas.html', 'atletas'],
      ['Invitaciones', '/entrenador/invitaciones.html', 'invitaciones'],
      ['Ejercicios', '/entrenador/ejercicios.html', 'ejercicios'],
      ['Rutinas', '/entrenador/rutinas.html', 'rutinas'],
      ['Alimentos', '/entrenador/alimentos.html', 'alimentos'],
      ['Nutrición', '/entrenador/nutricion.html', 'nutricion'],
      ['Check-ins', '/entrenador/checkins.html', 'checkins'],
      ['Mensajes', '/compartido/mensajes.html', 'mensajes'],
      ['Notificaciones', '/compartido/notificaciones.html', 'notificaciones'],
      ['Perfil', '/compartido/perfil.html', 'perfil'],
    ],
    tabs: [
      '/entrenador/panel.html',
      '/entrenador/atletas.html',
      '/entrenador/rutinas.html',
      '/compartido/mensajes.html',
    ],
  },
  athlete: {
    links: [
      ['Panel', '/atleta/panel.html', 'panel'],
      ['Rutinas', '/atleta/rutinas.html', 'rutinas'],
      ['Historial', '/atleta/historial.html', 'historial'],
      ['Nutrición', '/atleta/nutricion.html', 'nutricion'],
      ['Progreso', '/atleta/progreso.html', 'progreso'],
      ['Check-in', '/atleta/checkin.html', 'checkins'],
      ['Mensajes', '/compartido/mensajes.html', 'mensajes'],
      ['Notificaciones', '/compartido/notificaciones.html', 'notificaciones'],
      ['Perfil', '/compartido/perfil.html', 'perfil'],
    ],
    tabs: [
      '/atleta/panel.html',
      '/atleta/rutinas.html',
      '/atleta/progreso.html',
      '/compartido/mensajes.html',
    ],
  },
};

const brand = `<span class="logo-mark">${icon('pesa')}</span>Gym<span>Track</span>`;
const isCurrent = (url) => location.pathname === url;

function initials(user) {
  return `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || '·';
}

function countMarkup(count, className = 'nav-count', etiqueta = 'notificaciones pendientes') {
  if (!count) return '';
  return `<span class="${className}" aria-label="${count} ${etiqueta}">${count > 99 ? '99+' : count}</span>`;
}

const NOTIFICACIONES = '/compartido/notificaciones.html';
const MENSAJES = '/compartido/mensajes.html';

/* Pinta o retira un contador dentro de los elementos indicados, sin volver a
   dibujar la navegación entera.

   Tiene que poder CREAR el elemento, no solo cambiarlo: cuando la página se
   carga sin nada pendiente, `countMarkup` no genera nada y no hay ningún
   contador al que cambiarle el texto. */
function pintarContador(destinos, count, etiqueta) {
  for (const [contenedor, clase] of destinos) {
    if (!contenedor) continue;
    let badge = contenedor.querySelector(`.${clase}`);

    if (!count) {
      badge?.remove();
      continue;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = clase;
      contenedor.append(badge);
    }

    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', `${count} ${etiqueta}`);
  }
}

/* Avisos pendientes: menú lateral y botón "Más" de la barra inferior, que es
   donde vive la bandeja en móvil. */
export function setUnreadBadges(count) {
  pintarContador(
    [
      [document.querySelector(`[data-sidebar] a[href="${NOTIFICACIONES}"]`), 'nav-count'],
      [document.querySelector('#more-tab'), 'tab-count'],
    ],
    count,
    'notificaciones pendientes',
  );
}

/* Mensajes sin leer. A diferencia de los avisos, "Mensajes" sí tiene su propio
   acceso en la barra inferior, así que el contador va sobre él y no sobre
   "Más". Sin esto, un mensaje nuevo solo se anunciaba junto a Notificaciones y
   había que abrir la bandeja para descubrir que era un mensaje. */
export function setMessageBadges(count) {
  pintarContador(
    [
      [document.querySelector(`[data-sidebar] a[href="${MENSAJES}"]`), 'nav-count'],
      [document.querySelector(`.bottom-nav a[href="${MENSAJES}"]`), 'tab-count'],
    ],
    count,
    'mensajes sin leer',
  );
}

/* `counts` lleva los dos contadores: avisos pendientes y mensajes sin leer.
   Cada enlace recibe el suyo, si le corresponde alguno. */
function badgeFor(url, counts) {
  if (url === NOTIFICACIONES) return countMarkup(counts.notifications);
  if (url === MENSAJES) return countMarkup(counts.messages, 'nav-count', 'mensajes sin leer');
  return '';
}

function navLinks(links, counts) {
  return links
    .map(
      ([label, url, name]) =>
        `<a class="nav-link${isCurrent(url) ? ' active' : ''}" href="${url}"${isCurrent(url) ? ' aria-current="page"' : ''}>${icon(name)}<span>${label}</span>${badgeFor(url, counts)}</a>`,
    )
    .join('');
}

function fillSidebar(sidebar, user, menu, counts) {
  sidebar.innerHTML = `
    <div class="logo">${brand}</div>
    <nav aria-label="Secciones">${navLinks(menu.links, counts)}</nav>
    <div class="sidebar-footer">
      <div class="user-chip">
        <span class="avatar">${escapeHtml(initials(user))}</span>
        <div>
          <strong>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong>
          <small>${user.role === 'trainer' ? 'Entrenador' : 'Atleta'}</small>
        </div>
      </div>
      <div class="footer-actions">
        <button class="btn secondary small" id="logout">${icon('salir')}Cerrar sesión</button>
      </div>
    </div>`;
  sidebar.querySelector('#logout').onclick = logout;
  /* En escritorio la barra superior no existe, así que el cambio de
     tema vive aquí para estar siempre disponible. */
  sidebar.querySelector('.footer-actions').append(themeButton());
}

/* Barra superior con el botón que abre el menú y el cambio de tema.
   Solo se muestra por debajo de 1024 px; el CSS decide cuándo. */
function buildTopbar(openDrawer) {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'icon-btn';
  menuButton.innerHTML = icon('menu');
  menuButton.title = 'Abrir menú';
  menuButton.setAttribute('aria-label', 'Abrir menú');
  menuButton.onclick = openDrawer;

  const logo = document.createElement('div');
  logo.className = 'logo';
  logo.innerHTML = brand;

  topbar.append(menuButton, logo, themeButton());
  return topbar;
}

/* Barra inferior con los accesos frecuentes más un botón que abre
   el menú completo, para que ninguna sección quede inalcanzable. */
function buildBottomNav(menu, openDrawer, counts) {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Accesos rápidos');

  const tabs = menu.tabs
    .map((url) => menu.links.find((link) => link[1] === url))
    .filter(Boolean)
    .map(
      ([label, url, name]) =>
        /* "Mensajes" es el único acceso de esta barra que lleva contador
           propio; la bandeja de avisos vive detrás del botón "Más". */
        `<li><a class="tab${isCurrent(url) ? ' active' : ''}" href="${url}"${isCurrent(url) ? ' aria-current="page"' : ''}>${icon(name)}<span>${label}</span>${url === MENSAJES ? countMarkup(counts.messages, 'tab-count', 'mensajes sin leer') : ''}</a></li>`,
    )
    .join('');

  nav.innerHTML = `<ul>${tabs}<li><button type="button" class="tab" id="more-tab">${icon('mas')}<span>Más</span>${countMarkup(counts.notifications, 'tab-count')}</button></li></ul>`;
  nav.querySelector('#more-tab').onclick = openDrawer;
  return nav;
}

export async function initNavigation() {
  const user = await currentUser();

  /* Un atleta no debe quedarse en una pantalla de entrenador ni al revés. */
  const expected = location.pathname.includes('/entrenador/')
    ? 'trainer'
    : location.pathname.includes('/atleta/')
      ? 'athlete'
      : null;
  if (expected && user.role !== expected) {
    location.href = user.role === 'trainer' ? '/entrenador/panel.html' : '/atleta/panel.html';
    return user;
  }

  const sidebar = document.querySelector('[data-sidebar]');
  if (!sidebar) return user;

  const menu = menus[user.role];
  const counts = { notifications: 0, messages: 0 };
  /* Los dos contadores se piden a la vez. `allSettled` para que el fallo de
     uno no deje al otro sin dibujar; el menú sigue siendo usable sin ellos. */
  const [avisos, mensajes] = await Promise.allSettled([
    api('/api/notifications/unread-count'),
    api('/api/messages/unread-count'),
  ]);
  if (avisos.status === 'fulfilled') counts.notifications = avisos.value.unread;
  if (mensajes.status === 'fulfilled') counts.messages = mensajes.value.unread;

  fillSidebar(sidebar, user, menu, counts);

  const shell = sidebar.parentElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';

  const closeDrawer = () => {
    document.body.classList.remove('drawer-open');
    sidebar.removeAttribute('aria-modal');
  };
  const openDrawer = () => {
    document.body.classList.add('drawer-open');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.querySelector('.nav-link')?.focus();
  };

  scrim.onclick = closeDrawer;
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  shell.prepend(buildTopbar(openDrawer));
  shell.append(scrim, buildBottomNav(menu, openDrawer, counts));

  /* Avisos en tiempo real. Sin esto los contadores solo cambiaban al cargar
     una página: quien recibía un mensaje estando en otra pantalla no se
     enteraba hasta navegar. La conexión se pide después de dibujar el menú
     para no retrasar su aparición, y si falla todo lo demás sigue igual. */
  socket()
    .then((conexion) => {
      conexion?.on('notification:new', ({ notification }) => {
        counts.notifications += 1;
        setUnreadBadges(counts.notifications);

        /* Un mensaje se anuncia además sobre "Mensajes". Si solo subiera el
           contador de avisos, habría que abrir la bandeja para descubrir que
           lo que llegó era un mensaje. */
        if (notification?.type === 'message_received') {
          counts.messages += 1;
          setMessageBadges(counts.messages);
        }
      });
    })
    .catch(() => {
      /* Sin tiempo real los contadores siguen actualizándose al cambiar de página. */
    });

  /* Si la ventana crece hasta el tamaño de escritorio, el menú
     deslizante deja de tener sentido y debe cerrarse. */
  matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches) closeDrawer();
  });

  return user;
}
