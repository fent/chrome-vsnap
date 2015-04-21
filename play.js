var player =
  document.getElementById('movie_player') ||
  document.getElementById('player1') ||
  document.getElementsByTagName('video')[0] ||
  document.getElementsByTagName('object')[0] ||
  document.getElementsByTagName('embed')[0];

if (player) {
  if (player.playVideo) { player.playVideo(); }
  else if (player.play) { player.play(); }
}
