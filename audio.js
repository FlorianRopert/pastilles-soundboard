// Lecture de sons (popup + offscreen document). Pas utilisable dans le service worker.
var BIPS = { vert: 880, bleu: 660, jaune: 330, rouge: 200, gris: 440 };

var arretCourant = null;
function arreterSon() { if (arretCourant) { arretCourant(); } }

function bip(couleur) {
  return new Promise(function (resolve) {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.frequency.value = BIPS[couleur] || 440;
    osc.type = 'square';
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(resolve, 350);
  });
}

// joue une URL ; la promesse se termine à la fin du son (ou après dureeMax ms).
// Si le son ne peut pas être lu, on joue un bip à la place.
function jouerUrlAvecSecours(url, couleur, dureeMax) {
  return new Promise(function (resolve) {
    if (!url) { bip(couleur).then(resolve); return; }

    var audio = new Audio(url);
    var fini = false;
    var minuteur = setTimeout(fin, dureeMax || 6000);

    function fin() {
      if (fini) { return; }
      fini = true;
      clearTimeout(minuteur);
      audio.pause();
      resolve();
    }
    function secours() {
      if (fini) { return; }
      fini = true;
      clearTimeout(minuteur);
      bip(couleur).then(resolve);
    }

    arretCourant = fin;
    audio.addEventListener('ended', fin);
    audio.addEventListener('error', secours);
    audio.play().catch(secours);
  });
}
