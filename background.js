/* global chrome */
/* jshint maxlen: false, quotmark: false */

var extMonitorWindows = [];
var playerWindow = null;
var wins = {};
function findPlayerWindow() {
  if (playerWindow) { return; }
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

chrome.windows.getAll({}, function(list) {
  wins = {};
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
  if (playerWindow && playerWindow.id === winID) {
    playerWindow = null;
    findPlayerWindow();
  }
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
var controlVideoSites = /https?:\/\/(www\.)?(youtube\.com\/(watch|embed)|twitch\.tv\/[a-z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer|[^\s]+:32400\/web\/index\.html)/i;

// Video sites that will be matched against when a new tab is created.
var videoSites = /https?:\/\/(www\.)?((m\.)?youtube\.com\/(watch|embed)|youtu\.be\/[a-z0-9_-]+|twitch\.tv\/[a-zA-Z0-9_]+\/[cv]\/[0-9]+|netflix\.com\/WiPlayer|cringechannel\.com\/\d{4}\/\d{2}\/\d{2}\/video-|dailymotion\.com\/video\/|worldstarhiphop\.com\/videos\/video\.php|worldstaruncut.com\/uncut\/\d+|liveleak\.com\/view|efukt\.com|facebook\.com\/(video\.php|[^\/]+\/videos\/))/i;

// `tab` doesn't contain some fields when barely created,
// namely `tab.active` and `tab.url`. So wait until it is updated.
var lastTabOpened = null;

chrome.tabs.onCreated.addListener(function(tab) {
  if (!playerWindow || extMonitorWindows.some(function(win) {
    return win.id === tab.windowId;
  })) {
    return;
  }
  lastTabOpened = tab.id;
});

chrome.tabs.onUpdated.addListener(function(tabID, info) {
  if (info.status || info.url) {
    delete playerExecd[tabID];
  }
  if (lastTabOpened === tabID && info.url) {
    chrome.tabs.get(tabID, function(tab) {
      // Only move tab if opened in the background.
      if ((!tab.active || !tab.openerTabId) && videoSites.test(tab.url)) {
        movedTabs[tab.id] = { tabID: tab.id, playingTabs: [] };
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

        pauseWinVideos(tabID);
      }
    });
  }
});

// Pause any videos in the same window.
function pauseWinVideos(movedTabID) {
  chrome.tabs.query({ windowId: playerWindow.id }, function(tabs) {
    tabs.forEach(function(wintab) {
      if (wintab.id !== movedTabID && controlVideoSites.test(wintab.url)) {
        var pause = function() {
          chrome.tabs.sendMessage(wintab.id, {
            pause: true
          }, {}, function(results) {
            // Take note if the tab was playing a video
            // so that it can be played when the tab is closed.
            if (results) {
              movedTabs[movedTabID].playingTabs.push(wintab.id);
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
      chrome.tabs.get(tabID, function(tab) {
        if (!tab) { return; }
        if (tab.active) {
          // Only play tab if active in its window.
          chrome.tabs.sendMessage(tabID, { play: true });
        } else if (tabStack.length) {
          // Otherwise, assign it to the next available video tab, if any.
          var nextTabID = tabStack[tabStack.length - 1];
          movedTabs[nextTabID].playingTabs.push(tabID);
        }
      });
    }, 1000);
  });

  delete movedTabs[tabID];
  var i = tabStack.indexOf(tabID);
  if (i > -1) { tabStack.splice(i, 1); }
});

chrome.tabs.onAttached.addListener(function(tabID, info) {
  if (lastTabOpened !== tabID) { return; }
  chrome.tabs.get(tabID, function(tab) {
    if (!videoSites.test(tab.url)) { return; }
    chrome.windows.get(info.newWindowId, function(win) {
      playerWindow = win;
      pauseWinVideos(tabID);
    });
  });
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
