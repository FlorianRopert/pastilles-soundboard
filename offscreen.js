// Page invisible qui joue les sons demandés par le service worker (le service worker ne peut pas jouer d'audio).
var DUREE_MAX_MS = 6000;   // un son est coupé après 6 s pour ne pas bloquer la file
var file = Promise.resolve();

chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.cible !== 'offscreen' || msg.type !== 'jouer-file') { return; }
  msg.items.forEach(function (item) {
    file = file.then(function () { return jouerUrlAvecSecours(item.url, item.couleur, DUREE_MAX_MS); });
  });
});
