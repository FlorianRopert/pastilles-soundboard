// ===== CONFIG (recherche de sons : common.js, lecture : audio.js) =====
var COULEURS_CSS = { rouge: '#d93025', gris: '#9aa0a6', vert: '#2e9e5b', bleu: '#2f6fdb', jaune: '#f2b01e' };
var NB_PASTILLES = 15;       // combien de dernières pastilles afficher

var monToken = null;
var monIdEleve = null;
var dernierePastille = null;

var $ = function (id) { return document.getElementById(id); };

function jouerSonPour(couleur) {
  trouverSons(couleur).then(function (urls) {
    jouerUrlAvecSecours(sonAuHasard(urls), couleur, 8000);
  });
}


// ===== DEMARRAGE =====
chrome.storage.local.get('tsproToken', function (res) {
  if (res.tsproToken) {
    verifToken(res.tsproToken, false);
  }
});

$('btnConnexion').addEventListener('click', function () {
  var saisie = $('champToken').value.trim();
  if (saisie === '') {
    $('messageLogin').textContent = 'Il faut coller un token.';
    $('messageLogin').style.color = 'red';
    return;
  }
  verifToken(saisie, true);
});

$('champToken').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { $('btnConnexion').click(); }
});

$('btnDeconnexion').addEventListener('click', function () {
  chrome.storage.local.remove('tsproToken');
  monToken = null;
  $('champToken').value = '';
  $('messageLogin').textContent = '';
  $('ecranDashboard').classList.add('cache');
  $('ecranLogin').classList.remove('cache');
});

$('btnSon').addEventListener('click', function () {
  if (dernierePastille) { jouerSonPour(dernierePastille.couleur); }
});


// ===== VERIFICATION DU TOKEN =====
function verifToken(token, saisieManuelle) {
  var msg = $('messageLogin');
  msg.style.color = '';
  msg.textContent = 'Vérification du token...';

  fetch(API + '/auth/verify-token', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'x-user-type': 'student'
    },
    body: JSON.stringify({ token: token })
  })
    .then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    })
    .then(function (data) {
      if (!data.valid) { throw new Error('token refusé'); }

      monToken = token;
      if (saisieManuelle) { chrome.storage.local.set({ tsproToken: token }); }

      var eleve = data.eleve || {};
      monIdEleve = eleve.id;
      $('nomEleve').textContent = (eleve.prenom || '') + ' ' + (eleve.nom || '');

      var photo = $('photoEleve');
      if (eleve.photo) { photo.src = eleve.photo; photo.style.display = 'block'; }
      else { photo.style.display = 'none'; }

      msg.textContent = '';
      $('ecranLogin').classList.add('cache');
      $('ecranDashboard').classList.remove('cache');

      // le clic sur "Se connecter" est un geste utilisateur : on peut jouer le son direct
      chargerNotes(false);
    })
    .catch(function (err) {
      console.error('verification du token :', err);
      chrome.storage.local.remove('tsproToken');
      monToken = null;
      $('ecranDashboard').classList.add('cache');
      $('ecranLogin').classList.remove('cache');
      msg.style.color = 'red';
      msg.textContent = 'Token invalide ou expiré, réessaie.';
    });
}


// ===== RECUPERATION DES PASTILLES =====
function chargerNotes(jouerAuto) {
  var etat = $('messageEtat');
  etat.style.color = '';
  etat.textContent = 'Chargement des évaluations...';

  fetch(API + '/notes', {
    headers: { 'Authorization': 'Bearer ' + monToken, 'x-user-type': 'student' }
  })
    .then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    })
    .then(function (notes) {
      if (!Array.isArray(notes)) { notes = notes.notes || notes.data || []; }

      // on ne garde que MES notes
      var mesNotes = notes.filter(function (n) {
        var id = n.id_eleve !== undefined ? n.id_eleve : n.eleve_id;
        return String(id) === String(monIdEleve);
      });

      var parDateDesc = function (a, b) { return new Date(b.date) - new Date(a.date); };

      // dernière pastille, toutes couleurs confondues (pour le son)
      var triees = mesNotes.slice().sort(parDateDesc);
      dernierePastille = triees.length > 0 ? triees[0] : null;

      if (dernierePastille) {
        $('infoDerniere').textContent = 'Dernière pastille : ' + dernierePastille.couleur +
          ' (' + formatDate(dernierePastille.date) + ')';
        $('btnSon').disabled = false;
      } else {
        $('infoDerniere').textContent = 'Aucune pastille pour le moment.';
        $('btnSon').disabled = true;
      }

      // les dernières pastilles, toutes couleurs, plus récentes en haut
      var recentes = regrouperDoublons(triees).slice(0, NB_PASTILLES);
      remplirListe(recentes);

      etat.textContent = '';
      if (jouerAuto && dernierePastille) { jouerSonPour(dernierePastille.couleur); }
    })
    .catch(function (err) {
      console.error('chargement des notes :', err);
      etat.style.color = 'red';
      etat.textContent = 'Impossible de récupérer les évaluations (token expiré ou souci réseau).';
    });
}


// ===== AFFICHAGE =====
function remplirListe(liste) {
  var ul = $('listePastilles');
  ul.innerHTML = '';

  if (liste.length === 0) {
    var vide = document.createElement('li');
    vide.className = 'vide';
    vide.textContent = 'Aucune pastille pour le moment';
    ul.appendChild(vide);
    return;
  }

  liste.forEach(function (note) {
    var li = document.createElement('li');
    li.className = 'ligne';
    li.tabIndex = 0;
    li.title = note.commentaire ? note.commentaire : 'Cliquer pour jouer le son';

    var pastille = document.createElement('span');
    pastille.className = 'pastille';
    pastille.style.backgroundColor = COULEURS_CSS[note.couleur] || '#9aa0a6';
    li.appendChild(pastille);

    var infos = document.createElement('div');
    infos.className = 'infos';
    var nom = document.createElement('div');
    nom.className = 'nom';
    nom.textContent = note.devoir_label ? note.devoir_label : note.competence_code;
    var code = document.createElement('div');
    code.className = 'code';
    code.textContent = note.competence_code;
    infos.appendChild(nom);
    infos.appendChild(code);
    li.appendChild(infos);

    if (note.nbFois > 1) {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '×' + note.nbFois;
      li.appendChild(badge);
    }

    var date = document.createElement('span');
    date.className = 'date';
    date.textContent = formatDate(note.date);
    li.appendChild(date);

    // clic (ou Entrée) sur une ligne = joue le son de sa couleur
    li.addEventListener('click', function () { jouerSonPour(note.couleur); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') { jouerSonPour(note.couleur); } });

    ul.appendChild(li);
  });
}

function regrouperDoublons(liste) {
  var vues = {};
  var resultat = [];
  liste.forEach(function (note) {
    var cle = note.couleur + '|' + note.competence_code + '|' + note.date + '|' + note.devoir_label;
    if (vues[cle]) { vues[cle].nbFois++; }
    else { note.nbFois = 1; vues[cle] = note; resultat.push(note); }
  });
  return resultat;
}

function formatDate(valeur) {
  if (!valeur) { return ''; }
  var d = new Date(valeur);
  if (isNaN(d.getTime())) { return valeur; }
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
}


// ===== ONGLETS =====
var ORDRE = ['vert', 'bleu', 'jaune', 'rouge', 'gris'];
var LIBELLES = { vert: 'Vert : super bien', bleu: 'Bleu : bien', jaune: 'Jaune : pas ouf', rouge: 'Rouge : nul', gris: 'Gris : neutre' };

function afficherOnglet(nom) {
  var sons = nom === 'sons';
  $('vuePastilles').classList.toggle('cache', sons);
  $('vueSons').classList.toggle('cache', !sons);
  $('ongletPastilles').classList.toggle('actif', !sons);
  $('ongletSons').classList.toggle('actif', sons);
  if (sons && !$('vueSons').hasChildNodes()) { construireVueSons(); }
}
$('ongletPastilles').addEventListener('click', function () { afficherOnglet('pastilles'); });
$('ongletSons').addEventListener('click', function () { afficherOnglet('sons'); });

// "bruh-sound-effect_4VXhQMR.mp3" -> "bruh sound effect"
function nomDuSon(url) {
  var fichier = decodeURIComponent(url.split('/').pop()).replace(/\.mp3$/i, '');
  return fichier.replace(/_[A-Za-z0-9]{5,8}$/, '').replace(/[-_]+/g, ' ');
}

function construireVueSons() {
  var vue = $('vueSons');
  vue.innerHTML = '';

  ORDRE.forEach(function (couleur) {
    var bloc = document.createElement('section');
    bloc.className = 'bloc';

    var titre = document.createElement('h2');
    var rond = document.createElement('span');
    rond.className = 'rond';
    rond.style.backgroundColor = COULEURS_CSS[couleur];
    titre.appendChild(rond);
    titre.appendChild(document.createTextNode(LIBELLES[couleur]));

    var btnHasard = document.createElement('button');
    btnHasard.textContent = 'Au hasard';
    btnHasard.addEventListener('click', function () { jouerSonPour(couleur); });

    var btnActu = document.createElement('button');
    btnActu.className = 'discret';
    btnActu.textContent = 'Actualiser';
    btnActu.title = 'Refaire la recherche de sons pour cette couleur';
    btnActu.addEventListener('click', function () { viderCacheSons(couleur).then(remplir); });

    titre.appendChild(btnHasard);
    titre.appendChild(btnActu);
    bloc.appendChild(titre);

    var liste = document.createElement('ul');
    bloc.appendChild(liste);
    vue.appendChild(bloc);

    function message(texte) {
      liste.innerHTML = '';
      var li = document.createElement('li');
      li.className = 'vide';
      li.textContent = texte;
      liste.appendChild(li);
    }

    function remplir() {
      message('Recherche des sons...');
      trouverSons(couleur).then(function (urls) {
        if (urls.length === 0) { message('Aucun son trouvé (Myinstants injoignable ?)'); return; }
        liste.innerHTML = '';
        urls.forEach(function (url) {
          var li = document.createElement('li');
          li.className = 'ligne';
          li.tabIndex = 0;
          li.textContent = '\u25B6 ' + nomDuSon(url);
          var jouer = function () { jouerUrlAvecSecours(url, couleur, 8000); };
          li.addEventListener('click', jouer);
          li.addEventListener('keydown', function (e) { if (e.key === 'Enter') { jouer(); } });
          liste.appendChild(li);
        });
      });
    }
    remplir();
  });
}


// ===== LECTURE AUTO SUR EFE =====
chrome.storage.local.get('autoActive', function (res) {
  $('caseAuto').checked = res.autoActive !== false;
});
$('caseAuto').addEventListener('change', function () {
  chrome.storage.local.set({ autoActive: $('caseAuto').checked });
});
chrome.action.setBadgeText({ text: '' });   // efface le "!" quand on ouvre le popup
