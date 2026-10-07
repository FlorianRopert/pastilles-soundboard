// Code partagé entre le popup et le service worker (pas de DOM ici).
var API = 'https://efe.tspro.fr';
var MYINSTANTS = 'https://www.myinstants.com';

// Mots-clés cherchés sur Myinstants pour chaque couleur. Change-les comme tu veux.
var RECHERCHES = {
  vert:  ['ouais c est greatttt', 'incroyable', 'la classe', 'les champions', 'bravo'],  // super bien
  bleu:  ['pas mal', 'bien joué', 'ça c est fort', 'applaudissements', 'félicitations'], // bien
  jaune: ['c est pas faux', 'bof', 'mouais', 'gênant', 'hmm'],                            // pas ouf
  rouge: ['c est la honte', 'nul', 'vous êtes nuls', 'allo non mais allo quoi', 'bruh'],  // nul
  gris:  ['hein', 'quoi', 'ah bon']                                                       // neutre
};

var RESULTATS_PAR_MOT = 3;     // sons gardés par mot-clé
var CACHE_JOURS = 7;           // durée du cache des recherches
var MAX_SONS_PAR_VISITE = 5;   // max de sons joués d'un coup à l'ouverture d'EFE (anti-spam)

// Myinstants n'a pas d'API officielle : on lit sa page de recherche et on extrait les liens mp3.
function chercherMp3(requete) {
  return fetch(MYINSTANTS + '/en/search/?name=' + encodeURIComponent(requete))
    .then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.text();
    })
    .then(function (html) {
      var urls = [];
      var re = /\/media\/sounds\/[^'"\s)]+\.mp3/g;
      var m;
      while ((m = re.exec(html)) && urls.length < RESULTATS_PAR_MOT) {
        var url = MYINSTANTS + m[0];
        if (urls.indexOf(url) === -1) { urls.push(url); }
      }
      return urls;
    });
}

// liste d'URLs de sons pour une couleur, depuis le cache si possible
function trouverSons(couleur) {
  return new Promise(function (resolve) {
    chrome.storage.local.get('cacheSons', function (res) {
      var cache = res.cacheSons || {};
      var entree = cache[couleur];
      var limite = CACHE_JOURS * 24 * 3600 * 1000;

      if (entree && entree.urls.length > 0 && Date.now() - entree.date < limite) {
        resolve(entree.urls);
        return;
      }

      var mots = RECHERCHES[couleur] || [];
      Promise.all(mots.map(function (mot) {
        return chercherMp3(mot).catch(function (err) {
          console.error('recherche "' + mot + '" :', err);
          return [];
        });
      })).then(function (groupes) {
        var urls = [].concat.apply([], groupes);
        urls = urls.filter(function (u, i) { return urls.indexOf(u) === i; });
        if (urls.length > 0) {
          cache[couleur] = { date: Date.now(), urls: urls };
          chrome.storage.local.set({ cacheSons: cache });
        }
        resolve(urls);
      });
    });
  });
}

function viderCacheSons(couleur) {
  return new Promise(function (resolve) {
    chrome.storage.local.get('cacheSons', function (res) {
      var cache = res.cacheSons || {};
      delete cache[couleur];
      chrome.storage.local.set({ cacheSons: cache }, resolve);
    });
  });
}

function sonAuHasard(urls) {
  return urls.length > 0 ? urls[Math.floor(Math.random() * urls.length)] : null;
}

// identifiant d'une pastille (sert à ne jouer chaque pastille qu'une fois)
function cleNote(n) {
  return n.couleur + '|' + n.competence_code + '|' + n.date + '|' + n.devoir_label;
}

// vérifie le token puis renvoie { eleve, mes } : MES pastilles, de la plus récente à la plus ancienne
async function recupererMesPastilles(token) {
  var entetes = { 'Authorization': 'Bearer ' + token, 'x-user-type': 'student' };

  var r = await fetch(API + '/auth/verify-token', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, entetes),
    body: JSON.stringify({ token: token })
  });
  if (!r.ok) { throw new Error('verify-token HTTP ' + r.status); }
  var v = await r.json();
  if (!v.valid) { throw new Error('token refusé'); }

  var r2 = await fetch(API + '/notes', { headers: entetes });
  if (!r2.ok) { throw new Error('notes HTTP ' + r2.status); }
  var notes = await r2.json();
  if (!Array.isArray(notes)) { notes = notes.notes || notes.data || []; }

  var monId = v.eleve && v.eleve.id;
  var mes = notes.filter(function (n) {
    var id = n.id_eleve !== undefined ? n.id_eleve : n.eleve_id;
    return String(id) === String(monId);
  });
  mes.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return { eleve: v.eleve, mes: mes };
}
