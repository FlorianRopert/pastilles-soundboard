// Page invisible qui joue les sons demandés par le service worker (le service worker ne peut pas jouer d'audio).
var DUREE_MAX_MS = 6000;   // un son est coupé après 6 s pour ne pas bloquer la file
var file = Promise.resolve();
var generation = 0;        // un clic direct sur une pastille coupe tout ce qui jouait avant

chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.cible !== 'offscreen') { return; }

  if (msg.type === 'jouer-direct') {
    generation++;
    arreterSon();
  } else if (msg.type !== 'jouer-file') {
    return;
  }

  var maGeneration = generation;
  (msg.items || []).forEach(function (item) {
    file = file.then(function () {
      if (maGeneration !== generation) { return; }
      return jouerUrlAvecSecours(item.url, item.couleur, DUREE_MAX_MS);
    }).catch(function (err) { console.error('lecture :', err); });
  });
});

// le listener est en place : on prévient le service worker qu'il peut envoyer ses sons
chrome.runtime.sendMessage({ type: 'offscreen-pret' }).catch(function () {});