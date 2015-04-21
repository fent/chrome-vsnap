var player =
  document.getElementById('movie_player') ||
  document.getElementById('player1') ||
  document.getElementsByTagName('video')[0] ||
  document.getElementsByTagName('object')[0] ||
  document.getElementsByTagName('embed')[0];

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
