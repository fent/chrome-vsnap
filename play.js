var player =
  document.getElementById('movie_player') ||
  document.getElementsByTagName('embed')[0] ||
  document.getElementById('player1') ||
  document.getElementsByTagName('object')[0] ||
  document.getElementsByTagName('video')[0];

if (player) {
  if (player.playVideo) { player.playVideo(); }
  else if (player.play) { player.play(); }
}
