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


var movedTabs = {};
var controlVideoSites = /https?:\/\/www\.(youtube\.com\/(watch|embed)|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer)/i;
var videoSites = /https?:\/\/www\.(youtube\.com\/(watch|embed)|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer)/i;

chrome.tabs.onCreated.addListener(function(tab) {
  // `tab` doesn't contain some fields when barely created,
  // namely `tab.active` and `tab.url`. So query for it again.
  chrome.tabs.get(tab.id, function(tab) {
    // Only move tab if opened in the background.
    if (playerWindow && tab.windowId !== playerWindow.id &&
        !tab.active && videoSites.test(tab.url)) {
      var moveInfo = movedTabs[tab.id] = { tabID: tab.id, playingTabs: [] };
      chrome.tabs.move(tab.id, {
        windowId: playerWindow.id,
        index: -1,
      }, function() {
        chrome.tabs.update(tab.id, { active: true });
      });

      // Pause any videos in the same window.
      chrome.tabs.query({ windowId: playerWindow.id }, function(tabs) {
        tabs.forEach(function(wintab) {
          if (wintab.id !== tab.id && controlVideoSites.test(wintab.url)) {
            chrome.tabs.sendMessage(wintab.id, {
              pause: true
            }, {}, function(results) {
              // Take note if the tab was playing a video
              // so that it can be played when the tab is closed.
              if (results) {
                moveInfo.playingTabs.push(wintab.id);
              }
            });
          }
        });
      });
    }
  });
});

chrome.tabs.onRemoved.addListener(function(tabID, info) {
  // Don't do anything if this tab isn't one of the moved ones,
  // or if it is but was moved to another window,
  // or if it's the last tab in the window.
  if (!movedTabs[tabID] ||
      info.windowId !== playerWindow.id || info.isWindowClosing) {
    return;
  }

  // Play every tab that was paused.
  movedTabs[tabID].playingTabs.forEach(function(tabID) {
    // Delay re-playing the video a bit, to give the closed tab some
    // time to process.
    setTimeout(function() {
      chrome.tabs.sendMessage(tabID, { play: true });
    }, 1000);
  });

  delete movedTabs[tabID];
});
