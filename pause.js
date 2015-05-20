var isCorrectPlayer = window.location.hostname === 'www.twitch.tv' ?
  function(player) { return player.getVideoTime; } :
  function(player) { return player.playVideo || player.play; } ;
function getPlayer(byId, name) {
  var player = byId ?
    document.getElementById(name) : document.getElementsByTagName(name)[0];
  return player && isCorrectPlayer(player) ? player : null;
}

var player =
  getPlayer(true, 'movie_player') ||
  getPlayer(true, 'player1') ||
  getPlayer(false, 'video') ||
  getPlayer(false, 'object') ||
  getPlayer(false, 'embed');

var paused = false;
if (player &&
   (player.getPlayerState && player.getPlayerState() === 1 ||
    player.isPaused && !player.isPaused() ||
    player.paused === false)) {
  if (player.pauseVideo) { player.pauseVideo(); }
  else if (player.pause) { player.pause(); }
  paused = true;
}

var e = new CustomEvent('result', { detail: paused });
document.getElementById('_vsnap').dispatchEvent(e);
