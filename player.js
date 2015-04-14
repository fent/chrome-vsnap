/* global chrome */

function runScript(file, callback) {
  var $script = document.createElement('script');
  $script.id = '_vsnap';
  $script.src = chrome.extension.getURL(file);
  if (callback) {
    $script.addEventListener('result', function(e) {
      callback(e.detail);
      document.body.removeChild($script);
    });
  } else {
    setTimeout(function() {
      document.body.removeChild($script);
    }, 500);
  }
  document.body.appendChild($script);
}

chrome.runtime.onMessage.addListener(function(message, _, sendResponse) {
  if (message.pause) {
    runScript('pause.js', sendResponse);
    return true;
  } else if (message.play) {
    runScript('play.js');
  }
});
