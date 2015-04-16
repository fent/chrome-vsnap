/* global chrome */
/* jshint maxlen: false, quotmark: false */

var extMonitorWindows = [];
var playerWindow = null;
var wins = {};
function findPlayerWindow() {
  var list = [];
  Object.keys(wins).forEach(function(id) {
    list.push(wins[id]);
  });
  extMonitorWindows = list
    // Filter out windows that are inside the main window.
    .filter(function(win) {
      return win.top < 0 || win.left < 0 ||
        (win.left > win.width && win.top > win.height);
    });
  playerWindow = extMonitorWindows.sort(function(a, b) {
      return b.width * b.height - a.width * a.height;
    })[0];
}

function getAllWins() {
  chrome.windows.getAll({}, function(list) {
    wins = {};
    list.forEach(function(win) {
      wins[win.id] = win;
    });
    findPlayerWindow();
  });
}

getAllWins();
setInterval(getAllWins, 300000);

chrome.windows.onCreated.addListener(function(win) {
  wins[win.id] = win;
  findPlayerWindow();
});

chrome.windows.onRemoved.addListener(function(winID) {
  delete wins[winID];
  findPlayerWindow();
});


// Used to keep track of which tabs have been moved,
// so that when they are removed, vsnap knows to play any paused tabs.
var movedTabs = {};

// The close last moved shortcut uses this to know what tabs were moved
// in what order.
var tabStack = [];

// `player.js` script is executed in a tab so it can listen to messages
// from vsnap to know when to pause/play videos.
// It's executed instead of added from a content script so that it runs
// after vsnap has been installed or reloaded without having to
// reload the tab.
var playerExecd = {};

// Sites which their players can be controlled. Other tabs in the same window
// in which a tab is moved, which match any of these sites, will be paused
// if they have any playing videos.
var controlVideoSites = /https?:\/\/www\.(youtube\.com\/(watch|embed)|twitch\.tv\/[a-z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer)/i;

// Video sites that will be matched against when a new tab is created.
var videoSites = /https?:\/\/(www\.)?(youtube\.com\/(watch|embed)|youtu\.be\/[a-z0-9_-]+|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer|cringechannel\.com\/|dailymotion\.com\/video\/|worldstarhiphop\.com\/videos\/video\.php|liveleak\.com\/view|efukt\.com)/i;

chrome.tabs.onCreated.addListener(function(tab) {
  if (!playerWindow || extMonitorWindows.some(function(win) {
    return win.id === tab.windowId;
  })) {
    return;
  }

  // `tab` doesn't contain some fields when barely created,
  // namely `tab.active` and `tab.url`. So query for it again.
  chrome.tabs.get(tab.id, function(tab) {
    // Only move tab if opened in the background.
    if ((!tab.active || !tab.openerTabId) && videoSites.test(tab.url)) {
      var moveInfo = movedTabs[tab.id] = { tabID: tab.id, playingTabs: [] };
      tabStack.push(tab.id);
      chrome.tabs.move(tab.id, {
        windowId: playerWindow.id,
        index: -1,
      }, function() {
        chrome.tabs.update(tab.id, { active: true });
        if (tab.openerTabId) {
          chrome.windows.update(tab.windowId, { focused: true });
        }
      });

      // Pause any videos in the same window.
      chrome.tabs.query({ windowId: playerWindow.id }, function(tabs) {
        tabs.forEach(function(wintab) {
          if (wintab.id !== tab.id && controlVideoSites.test(wintab.url)) {
            var pause = function() {
              chrome.tabs.sendMessage(wintab.id, {
                pause: true
              }, {}, function(results) {
                // Take note if the tab was playing a video
                // so that it can be played when the tab is closed.
                if (results) {
                  moveInfo.playingTabs.push(wintab.id);
                }
              });
            };
            if (playerExecd[wintab.id]) { pause(); }
            else {
              chrome.tabs.executeScript(wintab.id, {
                file: 'player.js',
              }, function() {
                playerExecd[wintab.id] = true;
                pause();
              });
            }
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
  var i = tabStack.indexOf(tabID);
  if (i > -1) { tabStack.splice(i, 1); }
});

function checkLastTab() {
  if (!tabStack.length) { return; }
  var tabID = tabStack.pop();
  chrome.tabs.get(tabID, function(tab) {
    // Only close tab if it's active and still showing a video.
    if (tab.active && videoSites.test(tab.url)) {
      chrome.tabs.remove(tabID);
    } else {
      checkLastTab();
    }
  });
}

chrome.commands.onCommand.addListener(function(command) {
  if (command === 'close-moved-tab') { checkLastTab(); }
});
