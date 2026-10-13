importScripts('common.js');

var enCours = false;

// dès qu'un onglet finit de charger une page d'EFE, on lance la soundboard
chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  if (info.status !== 'complete' || !tab.url) { return; }
  if (tab.url.indexOf('https://efe.tspro.fr/') !== 0) { return; }
  lancerAuto();
});


// ----- offscreen document (seul endroit où l'on peut jouer du son) -----
var creationOffscreen = null;

// crée le document s'il n'existe pas, et ATTEND qu'il dise "je suis prêt" (message 'offscreen-pret')
async function assurerOffscreen() {
  var existants = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existants.length > 0) { return; }

  if (!creationOffscreen) {
    creationOffscreen = new Promise(function (resolve) {
      var fini = false;
      function terminer() {
        if (fini) { return; }
        fini = true;
        chrome.runtime.onMessage.removeListener(surMessage);
        resolve();
      }
      function surMessage(msg) {
        if (msg && msg.type === 'offscreen-pret') { terminer(); }
      }
      chrome.runtime.onMessage.addListener(surMessage);
      setTimeout(terminer, 2000);   // sécurité : on n'attend pas plus de 2 s

      chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Jouer le son des pastilles EFE'
      }).catch(function (err) {
        console.error('création offscreen :', err);
        terminer();
      });
    }).then(function () { creationOffscreen = null; });
  }
  await creationOffscreen;
}

// envoie une liste de sons à jouer ; lève une erreur si l'offscreen n'a pas reçu le message
async function envoyerAOffscreen(type, items) {
  await assurerOffscreen();
  await chrome.runtime.sendMessage({ cible: 'offscreen', type: type, items: items });
}


// ----- lecture automatique à l'ouverture d'EFE -----
async function lancerAuto() {
  if (enCours) { return; }
  enCours = true;

  try {
    var st = await chrome.storage.local.get(['tsproToken', 'autoActive', 'pastillesVues']);
    if (st.autoActive === false) { return; }

    if (!st.tsproToken) {
      chrome.action.setBadgeText({ text: '!' });   // il faut se connecter une fois dans le popup
      return;
    }

    var data = await recupererMesPastilles(st.tsproToken);
    chrome.action.setBadgeText({ text: '' });

    // une pastille = un son, une seule fois : on compare avec celles déjà jouées
    var vues = new Set(st.pastillesVues || []);
    var nouvelles = [];
    var dejaVuDansCeLot = new Set();
    data.mes.forEach(function (n) {
      var cle = cleNote(n);
      if (!vues.has(cle) && !dejaVuDansCeLot.has(cle)) {
        dejaVuDansCeLot.add(cle);
        nouvelles.push(n);
      }
    });

    if (nouvelles.length === 0) { return; }

    // on ne joue que les plus récentes (anti-spam)
    var items = [];
    var aJouer = nouvelles.slice(0, MAX_SONS_PAR_VISITE);
    for (var i = 0; i < aJouer.length; i++) {
      var urls = await sonsActifs(aJouer[i].couleur);
      items.push({ url: sonAuHasard(urls), couleur: aJouer[i].couleur });
    }

    // on envoie D'ABORD ; si l'envoi échoue, on part dans le catch SANS marquer les pastilles comme vues
    await envoyerAOffscreen('jouer-file', items);

    // envoi réussi : on marque tout comme vu (même au-delà de la limite anti-spam)
    var toutes = Array.from(vues).concat(nouvelles.map(cleNote));
    await chrome.storage.local.set({ pastillesVues: toutes.slice(-2000) });
  } catch (err) {
    console.error('lecture auto :', err);
    chrome.action.setBadgeText({ text: '!' });
  } finally {
    enCours = false;
  }
}


// ----- clic sur une pastille directement dans la page EFE (message envoyé par efe.js) -----
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === 'jouer-direct' && !msg.cible &&
      ['vert', 'bleu', 'jaune', 'rouge', 'gris'].indexOf(msg.couleur) !== -1) {
    jouerDirect(msg.couleur);
  }
});

async function jouerDirect(couleur) {
  try {
    var urls = await sonsActifs(couleur);
    await envoyerAOffscreen('jouer-direct', [{ url: sonAuHasard(urls), couleur: couleur }]);
  } catch (err) {
    console.error('clic direct :', err);
  }
}