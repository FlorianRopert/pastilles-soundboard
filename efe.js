// Script injecté sur efe.tspro.fr : bouton flottant + son au clic sur les pastilles.
(function () {
  if (window.__pastillesSoundboard) { return; }
  window.__pastillesSoundboard = true;

  // ===== BOUTON FLOTTANT + PANNEAU (dans un shadow DOM pour ne pas être touché par le CSS d'EFE) =====
  var hote = document.createElement('div');
  var ombre = hote.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent =
    '#bouton{position:fixed;left:20px;bottom:20px;width:48px;height:48px;border-radius:50%;border:0;background:#1d1f23;color:#fff;font-size:22px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:2147483647}' +
    '#bouton:hover{transform:scale(1.06)}' +
    '#bouton:focus-visible,.entete a:focus-visible,.entete button:focus-visible{outline:2px solid #2f6fdb;outline-offset:2px}' +
    '#panneau{position:fixed;left:20px;bottom:80px;width:432px;height:min(600px,calc(100vh - 110px));background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;z-index:2147483647}' +
    '#panneau[hidden]{display:none}' +
    '.entete{display:flex;align-items:center;gap:10px;padding:6px 10px;background:#1d1f23;color:#fff;font:600 13px system-ui,sans-serif}' +
    '.entete span{flex:1}' +
    '.entete a,.entete button{color:#fff;background:transparent;border:0;cursor:pointer;font:inherit;text-decoration:none;padding:2px 4px}' +
    'iframe{flex:1;border:0;width:100%;background:#fff}';
  ombre.appendChild(style);

  var bouton = document.createElement('button');
  bouton.id = 'bouton';
  bouton.textContent = '\uD83D\uDD0A';
  bouton.title = 'Pastilles Soundboard';
  bouton.setAttribute('aria-label', 'Ouvrir Pastilles Soundboard');
  ombre.appendChild(bouton);

  var panneau = document.createElement('div');
  panneau.id = 'panneau';
  panneau.hidden = true;

  var entete = document.createElement('div');
  entete.className = 'entete';
  var titre = document.createElement('span');
  titre.textContent = 'Pastilles Soundboard';
  var lienOnglet = document.createElement('a');
  lienOnglet.href = chrome.runtime.getURL('popup.html');
  lienOnglet.target = '_blank';
  lienOnglet.textContent = 'Ouvrir dans un onglet';
  var fermer = document.createElement('button');
  fermer.textContent = '\u2715';
  fermer.setAttribute('aria-label', 'Fermer');
  entete.appendChild(titre);
  entete.appendChild(lienOnglet);
  entete.appendChild(fermer);
  panneau.appendChild(entete);
  ombre.appendChild(panneau);

  var cadre = null;
  function basculer(ouvert) {
    panneau.hidden = !ouvert;
    // le popup n'est chargé qu'à la première ouverture
    if (ouvert && !cadre) {
      cadre = document.createElement('iframe');
      cadre.src = chrome.runtime.getURL('popup.html');
      panneau.appendChild(cadre);
    }
  }
  bouton.addEventListener('click', function () { basculer(panneau.hidden); });
  fermer.addEventListener('click', function () { basculer(false); });
  ombre.addEventListener('keydown', function (e) { if (e.key === 'Escape') { basculer(false); } });

  document.documentElement.appendChild(hote);


  // ===== SON AU CLIC SUR UNE PASTILLE D'EFE =====
  var clicActif = true;
  chrome.storage.local.get('clicActif', function (res) { clicActif = res.clicActif !== false; });
  chrome.storage.onChanged.addListener(function (changes, zone) {
    if (zone === 'local' && changes.clicActif) { clicActif = changes.clicActif.newValue !== false; }
  });

  // couleur CSS "rgb(46, 204, 113)" -> nom de pastille (ou null si ce n'est pas une couleur de pastille)
  function nomCouleur(css) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(css || '');
    if (!m) { return null; }
    if (m[4] !== undefined && parseFloat(m[4]) < 0.5) { return null; }

    var r = m[1] / 255, g = m[2] / 255, b = m[3] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r) { h = 60 * (((g - b) / d + 6) % 6); }
      else if (max === g) { h = 60 * ((b - r) / d + 2); }
      else { h = 60 * ((r - g) / d + 4); }
    }

    if (s < 0.12) { return (l > 0.3 && l < 0.75) ? 'gris' : null; }   // blanc et noir = pas des pastilles
    if (s < 0.35 || l < 0.2 || l > 0.85) { return null; }
    if (h < 18 || h >= 340) { return 'rouge'; }
    if (h < 70) { return 'jaune'; }
    if (h < 170) { return 'vert'; }
    if (h < 260) { return 'bleu'; }
    return null;
  }

  var EMOJIS = { '\uD83D\uDD34': 'rouge', '\uD83D\uDFE2': 'vert', '\uD83D\uDD35': 'bleu', '\uD83D\uDFE1': 'jaune', '\uD83D\uDFE0': 'jaune' };

  // l'élément est-il une petite pastille ronde ? si oui, de quelle couleur
  function couleurDePastille(el) {
    if (!el || el.nodeType !== 1) { return null; }
    var r = el.getBoundingClientRect();
    if (r.width < 6 || r.width > 20 || r.height < 6 || r.height > 20) { return null; }
    if (Math.abs(r.width - r.height) > 3) { return null; }

    var cs = getComputedStyle(el);
    var rayon = cs.borderTopLeftRadius || '0px';
    var rond = rayon.indexOf('%') !== -1 ? parseFloat(rayon) >= 40 : parseFloat(rayon) >= Math.min(r.width, r.height) * 0.4;
    if (rond) {
      var c = nomCouleur(cs.backgroundColor);
      if (c) { return c; }
    }

    if (el.tagName.toLowerCase() === 'circle') { return nomCouleur(cs.fill); }

    var texte = (el.textContent || '').trim();
    if (EMOJIS[texte]) { return EMOJIS[texte]; }
    if (/^[\u25CF\u2022\u2B24]$/.test(texte)) { return nomCouleur(cs.color); }
    return null;
  }

  document.addEventListener('click', function (e) {
    if (!clicActif) { return; }
    if (e.composedPath().indexOf(hote) !== -1) { return; }   // clic dans notre propre bouton/panneau

    var cible = e.target;
    var couleur = couleurDePastille(cible) || couleurDePastille(cible.parentElement) || couleurDePastille(cible.firstElementChild);
    if (!couleur) { return; }

    try {
      chrome.runtime.sendMessage({ type: 'jouer-direct', couleur: couleur });
    } catch (err) {
      console.log('extension rechargée : recharge la page EFE', err);
    }
  }, true);
})();
