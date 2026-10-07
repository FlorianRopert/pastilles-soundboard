importScripts('common.js');

var enCours = false;

// dès qu'un onglet finit de charger une page d'EFE, on lance la soundboard
chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  if (info.status !== 'complete' || !tab.url) { return; }
  if (tab.url.indexOf('https://efe.tspro.fr/') !== 0) { return; }
  lancerAuto();
});

async function assurerOffscreen() {
  var existants = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existants.length > 0) { return; }
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Jouer le son des pastilles EFE'
  });
}

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

    // on marque tout comme vu AVANT de jouer : même en cas de souci, ça ne rejouera pas en boucle
    var toutes = Array.from(vues).concat(nouvelles.map(cleNote));
    await chrome.storage.local.set({ pastillesVues: toutes.slice(-2000) });

    // on ne joue que les plus récentes (anti-spam)
    var items = [];
    var aJouer = nouvelles.slice(0, MAX_SONS_PAR_VISITE);
    for (var i = 0; i < aJouer.length; i++) {
      var urls = await trouverSons(aJouer[i].couleur);
      items.push({ url: sonAuHasard(urls), couleur: aJouer[i].couleur });
    }

    await assurerOffscreen();
    chrome.runtime.sendMessage({ cible: 'offscreen', type: 'jouer-file', items: items });
  } catch (err) {
    console.error('lecture auto :', err);
    chrome.action.setBadgeText({ text: '!' });
  } finally {
    enCours = false;
  }
}
