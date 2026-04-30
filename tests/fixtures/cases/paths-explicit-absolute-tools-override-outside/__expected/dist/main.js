/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((__unused_webpack_module, exports) => {

var appCacheIframe;

// Defined by `install(options)` so that `update()` / `applyUpdate()` can
// forward errors to the user's callbacks. No-op until `install()` is called.
var sendEvent = function() {};

function hasSW() {
  
    return 'serviceWorker' in navigator && (
      window.location.protocol === 'https:' ||
      /^(.*\.)?localhost$/.test(window.location.hostname) || // only localhost or ends with .localhost
      window.location.hostname.indexOf('127.') === 0
    );
  
}

function install(options) {
  options || (options = {});

  sendEvent = function(event, error) {
    if (typeof options[event] !== 'function') return;

    var payload = { source: 'ServiceWorker' };
    if (error) payload.error = error;
    options[event](payload);
  };

  
    if (hasSW()) {
      var registration = navigator.serviceWorker
        .register(
          "/override/sw.js", {
            
            
          }
        );

      

      registration.then(function(reg) {
        // WTF no reg?
        if (!reg) return;

        // Installed but Shift-Reloaded (page is not controller by SW),
        // update might be ready at this point (more than one tab opened).
        // Anyway, if page is hard-reloaded, then it probably already have latest version
        // but it's not controlled by SW yet. Applying update will claim this page
        // to be controlled by SW. Maybe set flag to not reload it?
        // if (!navigator.serviceWorker.controller) return;

        
      }).catch(function(err) {
        // Forward registration failures to options.onError; also prevents
        // unhandled promise rejections when no callback is set.
        sendEvent('onError', err);
      });

      return;
    }
  

  
    if (window.applicationCache) {
      var directory = "/override/appcache";
      var name = "manifest";

      var doLoad = function() {
        var page = directory + name + '.html';
        var iframe = document.createElement('iframe');

        

        iframe.src = page;
        iframe.style.display = 'none';

        appCacheIframe = iframe;
        document.body.appendChild(iframe);
      };

      if (document.readyState === 'complete') {
        setTimeout(doLoad);
      } else {
        window.addEventListener('load', doLoad);
      }

      return;
    }
  
}

function applyUpdate(callback, errback) {
  

  
}

function update() {
  
    if (hasSW()) {
      navigator.serviceWorker.getRegistration().then(function(registration) {
        if (!registration) return;
        return registration.update();
      }).catch(function(err) {
        // registration.update() rejects when the browser cannot fetch the SW
        // script (network error, redirect on the script source, ...). Forward
        // to options.onError so callers can react; also prevents the
        // rejection from surfacing as an unhandled promise rejection.
        // Note: browser-initiated update checks (every 24h or on navigation)
        // cannot be intercepted from JS — only explicit update() calls.
        sendEvent('onError', err);
      });
    }
  

  
    if (appCacheIframe) {
      try {
        appCacheIframe.contentWindow.applicationCache.update();
      } catch (e) {}
    }
  
}



exports.install = install;
exports.applyUpdate = applyUpdate;
exports.update = update;


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
__webpack_require__(1);
})();

/******/ })()
;