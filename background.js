/* global chrome */
/* jshint maxlen: false, quotmark: false */

var playerWindow = null;
var wins = {};
function findPlayerWindow() {
  var list = [];
  Object.keys(wins).forEach(function(id) {
    list.push(wins[id]);
  });
  playerWindow = list
    // Filter out windows that are inside the main window.
    .filter(function(win) {
      return win.top < 0 || win.left < 0 ||
        (win.left > win.width && win.top > win.height);
    })
    .sort(function(a, b) {
      return b.width * b.height - a.width * a.height;
    })[0];
}

chrome.windows.getAll({}, function(list) {
  list.forEach(function(win) {
    wins[win.id] = win;
  });
  findPlayerWindow();
});

chrome.windows.onCreated.addListener(function(win) {
  wins[win.id] = win;
  findPlayerWindow();
});

chrome.windows.onRemoved.addListener(function(winID) {
  delete wins[winID];
  findPlayerWindow();
});


var controlVideoSites = /https?:\/\/www\.(youtube\.com\/(watch|embed)|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer)/i;
var videoSites = /https?:\/\/www\.(youtube\.com\/(watch|embed)|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer)/i;

// Giving `file` to `chrome.tabs.executeScript()` doesn't work.
var pausejs =
  "var player =" +
  "  document.getElementById('movie_player') ||" +
  "  document.getElementsByTagName('embed')[0] ||" +
  "  document.getElementById('player1') ||" +
  "  document.getElementsByTagName('object')[0] ||" +
  "  document.getElementsByTagName('video')[0];" +
  "" +
  "if (player) {" +
  "  if (player.pauseVideo) { player.pauseVideo(); }" +
  "  else if (player.pause) { player.pause(); }" +
  "}";

chrome.tabs.onCreated.addListener(function(tab) {
  // `tab` doesn't contain some fields when barely created,
  // namely `tab.active` and `tab.url`. So query for it again.
  chrome.tabs.get(tab.id, function(tab) {
    // Only move tab if opened in the background.
    if (playerWindow && tab.windowId !== playerWindow.id &&
        !tab.active && videoSites.test(tab.url)) {
      console.log('moving tab');
      chrome.tabs.move(tab.id, {
        windowId: playerWindow.id,
        index: -1,
      }, function() {
        chrome.tabs.update(tab.id, { active: true });
      });

      // Pause any videos in the same window.
      chrome.tabs.query({ windowId: playerWindow.id }, function(tabs) {
        tabs.forEach(function(winTab) {
          if (winTab.id !== tab.id && controlVideoSites.test(winTab.url)) {
            chrome.tabs.executeScript(winTab.id, {
              code: pausejs,
            });
          }
        });
      });
    }
  });
});
