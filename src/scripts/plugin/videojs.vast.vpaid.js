'use strict';

var VASTClient = require('../ads/vast/VASTClient');
var VASTError = require('../ads/vast/VASTError');
var vastUtil = require('../ads/vast/vastUtil');

var VASTIntegrator = require('../ads/vast/VASTIntegrator');
var VPAIDIntegrator = require('../ads/vpaid/VPAIDIntegrator');

var async = require('../utils/async');
var dom = require('../utils/dom');
var playerUtils = require('../utils/playerUtils');
var utilities = require('../utils/utilityFunctions');

var logger = require ('../utils/consoleLogger');

module.exports = function VASTPlugin(options) {
  var snapshot;
  var player = this;
  var vast = new VASTClient();
  var adsCanceled = false;

  var defaultOpts = {
    // maximum amount of time in ms to wait to receive `adsready` from the ad
    // implementation after play has been requested. Ad implementations are
    // expected to load any dynamic libraries and make any requests to determine
    // ad policies for a video during this time.
    timeout: 500,

    //TODO:finish this IOS FIX
    //Whenever you play an add on IOS, the native player kicks in and we loose control of it. On very heavy pages the 'play' event
    // May occur after the video content has already started. This is wrong if you want to play a preroll ad that needs to happen before the user
    // starts watching the content. To prevent this usec
    iosPrerollCancelTimeout: 2000,

    // maximun amount of time for the ad to actually start playing. If this timeout gets
    // triggered the ads will be cancelled
    adCancelTimeout: 3000,

    // Boolean flag that configures the player to play a new ad before the user sees the video again
    // the current video
    playAdAlways: false,

    // Flag to enable or disable the ads by default.
    adsEnabled: true,

    // Boolean flag to enable or disable the resize with window.resize or orientationchange
    autoResize: true,

    // verbosity of console logging:
    // 0 - error
    // 1 - error, warn
    // 2 - error, warn, info
    // 3 - error, warn, info, log
    // 4 - error, warn, info, log, debug
    verbosity: 0,

    preroll: true,
    postroll: false,
    midrolls: []
  };

  var settings = utilities.extend({}, defaultOpts, options || {});

  // we keep a count of the amount of ads we're planning to show.
  // if we have true for prerolls, we add 1, same with postrolls and we add thelenght for midrolls.
  var adsRemaining = 0;

  var totalMidrolls = utilities.isArray(settings.midrolls) ? settings.midrolls.length : 0;
  adsRemaining += settings.midrolls.length;
  
  // when we've played a midroll, push true
  var midrollsPlayed = [];

  // flag state for if an ad is playing or not.
  // used to determine behaviour on events as some events 
  // will be 'duped' between ad and content
  var adIsPlaying = false;

  if (utilities.isUndefined(settings.adTagUrl) && utilities.isDefined(settings.url)){
    settings.adTagUrl = settings.url;
  }

  if (utilities.isString(settings.adTagUrl)) {
    settings.adTagUrl = utilities.echoFn(settings.adTagUrl);
  }

  if (utilities.isDefined(settings.adTagXML) && !utilities.isFunction(settings.adTagXML)) {
    return trackAdError(new VASTError('on VideoJS VAST plugin, the passed adTagXML option does not contain a function'));
  }

  if (!utilities.isDefined(settings.adTagUrl) && !utilities.isFunction(settings.adTagXML)) {
    return trackAdError(new VASTError('on VideoJS VAST plugin, missing adTagUrl on options object'));
  }

  logger.setVerbosity(settings.verbosity);

  if (settings.preroll) {
    playerUtils.prepareForAds(player);
  }

  if (settings.playAdAlways) {
    // No matter what happens we play a new ad before the user sees the video again.
    player.on('vast.contentEnd', function () {
      setTimeout(function () {
        player.trigger('vast.reset');
      }, 0);
    });
  }

  




  if (settings.preroll && utilities.isBool(settings.preroll)) {

    adsRemaining++;

    player.on('vast.firstPlay', function () {
      tryToPlayRollAd();
      adsRemaining--;
    });
  } else {
    // only listen for this once, then remove the handler
    player.one('playing', function () {
      player.trigger('vast.contentStart');
    });
  }

  player.on('vast.contentStart', function () {
    adIsPlaying = false;
  });


  // trigger a vast.contentEnd event only if we're not
  // playing an ad and we've reached the end of the content
  // postroll currently depends on this.

  // renamed to a customEvent for now, as trying to use vast.contentEnd was failing tests.

  player.on('ended', function () {
    if (!adIsPlaying) {
      if (player.currentTime() > player.duration() - 1) {
        player.trigger('vast.postrollGo');
      }
    }
  });

  if (settings.postroll && utilities.isBool(settings.postroll)) {

    adsRemaining++;

    player.one('vast.postrollGo', function () {
      if (player.currentTime() > player.duration() - 1) {
        tryToPlayRollAd(); 
        adsRemaining--;
      }
    });
  }

  function validateMidrolls(midrolls) {
    
    // it should be an array
    if (!utilities.isArray(midrolls)) {
      return false;
    }

    // the array should use numbers as values
    for (var i=0,l=midrolls.length; i<l; i++) {
      if (!utilities.isNumber(midrolls[i])) {
        return false;
      }

      if (midrolls[i] >= player.duration()) {
        return false;
      }
    }

    return true;
  }

  function timeupdateWatcher() {
    if (adIsPlaying) {
      // this isn't always taken off, so this watcher 
      // keeps trucking along even though it shouldn't
      player.off('timeupdate', timeupdateWatcher);
    }

    var currentMidrollIndex;

    if (midrollsPlayed.length < totalMidrolls) {
      currentMidrollIndex = midrollsPlayed.length;
    } else {
      player.off('timeupdate', timeupdateWatcher);
      return;
    }

    var lookAhead = 0.5;

    if (player.currentTime() > settings.midrolls[currentMidrollIndex] &&
        !player.paused() &&
        !adIsPlaying) {
      player.off('timeupdate', timeupdateWatcher);
      tryToPlayRollAd();
      midrollsPlayed.push(true);


    } else if (player.currentTime() < settings.midrolls[currentMidrollIndex] && 
        player.currentTime() > settings.midrolls[currentMidrollIndex]-lookAhead &&
        !player.paused() &&
        !adIsPlaying) {
      player.off('timeupdate', timeupdateWatcher);
      tryToPlayRollAd();
      midrollsPlayed.push(true);
    }
  }

  player.on('vast.adStart', function () {
    adIsPlaying = true;
  });

  player.on('vast.adEnd', function () {
    adIsPlaying = false;
  });

  player.on('playing', function () {
    if (!adIsPlaying) {
      if (validateMidrolls(settings.midrolls)) {
        player.on('timeupdate', timeupdateWatcher);
      }
    }
  });

  player.on('paused', function () {
    if (!adIsPlaying) {
      if (validateMidrolls()) {
        player.off('timeupdate', timeupdateWatcher);
      }
    }
  });

  player.on('vast.reset', function () {
    //If we are reseting the plugin, we don't want to restore the content
    snapshot = null;
    cancelAds();
    adsRemaining = 0;
  });

  player.vast = {
    isEnabled: function () {
      return settings.adsEnabled;
    },

    enable: function () {
      settings.adsEnabled = true;
    },

    disable: function () {
      settings.adsEnabled = false;
    }
  };

  return player.vast;

  function tryToPlayRollAd() {
    // stop listening for timeupdate, we only do that for content
    player.off('timeupdate', timeupdateWatcher);
    // set flag
    adIsPlaying = true;

    //We remove the poster to prevent flickering whenever the content starts playing
    playerUtils.removeNativePoster(player);

    playerUtils.once(player, ['vast.adsCancel', 'vast.adEnd', 'vast.adSkip'], function () {
      removeAdUnit();
      restoreVideoContent();
    });

    async.waterfall([
      checkAdsEnabled,
      preparePlayerForAd,
      startAdCancelTimeout,
      playRollAd
    ], function (error, response) {
      if (error) {
        adsRemaining--;
        trackAdError(error, response);
      } else {
        adsRemaining--;
        player.trigger('vast.adEnd');
      }
    });

    /*** Local functions ***/

    function removeAdUnit() {
      if (player.vast && player.vast.adUnit) {
        player.vast.adUnit = null; //We remove the adUnit
      }
    }

    function restoreVideoContent() {
      setupContentEvents();

      if (snapshot) {
        playerUtils.restorePlayerSnapshot(player, snapshot);
        snapshot = null;
      }
    }

    function setupContentEvents() {
      playerUtils.once(player, ['playing', 'vast.reset', 'vast.firstPlay'], function (evt) {
        if (evt.type !== 'playing') {
          return;
        }

        player.trigger('vast.contentStart');

        playerUtils.once(player, ['ended', 'vast.reset', 'vast.firstPlay'], function (evt) {
          if (evt.type === 'ended' && !adIsPlaying) {
            player.trigger('vast.contentEnd');
          }
        });
      });
    }

    function checkAdsEnabled(next) {
      if (settings.adsEnabled) {
        return next(null);
      }
      next(new VASTError('Ads are not enabled'));
    }

    function preparePlayerForAd(next) {
      if (canPlayPrerollAd()) {
        snapshot = playerUtils.getPlayerSnapshot(player);
        player.pause();

        addSpinnerIcon();

        if(player.paused()) {
          next(null);
        } else {
          playerUtils.once(player, ['playing'], function() {
            player.pause();
            next(null);
          });
        }
      } else {
        next(new VASTError('video content has been playing before preroll ad'));
      }
    }

    function canPlayPrerollAd() {
      return !utilities.isIPhone() || player.currentTime() <= settings.iosPrerollCancelTimeout;
    }

    function startAdCancelTimeout(next) {
      var adCancelTimeoutId;
      adsCanceled = false;

      adCancelTimeoutId = setTimeout(function () {
        trackAdError(new VASTError('timeout while waiting for the video to start playing', 402));
      }, settings.adCancelTimeout);

      playerUtils.once(player, ['vast.adStart', 'vast.adsCancel', 'vast.adSkip'], clearAdCancelTimeout);

      /*** local functions ***/
      function clearAdCancelTimeout() {
        if (adCancelTimeoutId) {
          clearTimeout(adCancelTimeoutId);
          adCancelTimeoutId = null;
        }
      }

      next(null);
    }

    function addSpinnerIcon() {
      dom.addClass(player.el(), 'vjs-vast-ad-loading');
      playerUtils.once(player, ['vast.adStart', 'vast.adsCancel', 'vast.adSkip'], removeSpinnerIcon);
    }

    function removeSpinnerIcon() {
      //IMPORTANT NOTE: We remove the spinnerIcon asynchronously to give time to the browser to start the video.
      // If we remove it synchronously we see a flash of the content video before the ad starts playing.
      setTimeout(function () {
        dom.removeClass(player.el(), 'vjs-vast-ad-loading');
      }, 100);
    }
  }

  function cancelAds() {
    player.trigger('vast.adsCancel');
    adsCanceled = true;
  }

  function skipAd() {
    console.log('skipAd ................. called');
    player.trigger('vast.adSkip');
  }

  function playRollAd(callback) {
    async.waterfall([
      getVastResponse,
      playAd
    ], function(error, response) {
        if (utilities.isArray(settings.adTagUrl) && utilities.isDefined(settings.adTagUrl[0])) {
          playRollAd(callback);
        } else {
          callback(error, response);
        }
     });
   }

  function getVastResponse(callback) {
    if (utilities.isArray(settings.adTagUrl) && utilities.isDefined(settings.adTagUrl[0])) {
      vast.getVASTResponse(settings.adTagUrl ? settings.adTagUrl.shift() : settings.adTagXML, callback);
    } else {
      vast.getVASTResponse(settings.adTagUrl ? settings.adTagUrl() : settings.adTagXML, callback);
    }
  }

  function playAd(vastResponse, callback) {
    //TODO: Find a better way to stop the play. The 'playPrerollWaterfall' ends in an inconsistent situation
    //If the state is not 'preroll?' it means the ads were canceled therefore, we break the waterfall

    if (adsCanceled) {
      return;
    }

    // If the adTagUrl was a list of providers and we come across this function
    // then an ad is playing successfully so clear all the remaining ads we have.
    if (utilities.isArray(settings.adTagUrl) && utilities.isDefined(settings.adTagUrl[0])) {
      settings.adTagUrl.splice(0, settings.adTagUrl.length);
    }

    var adIntegrator = isVPAID(vastResponse) ? new VPAIDIntegrator(player, settings) : new VASTIntegrator(player);
    var adFinished = false;

    playerUtils.once(player, ['vast.adStart', 'vast.adsCancel', 'vast.adSkip'], function (evt) {
      if (evt.type === 'vast.adStart') {
        addAdsLabel();
      }
    });

    playerUtils.once(player, ['vast.adEnd', 'vast.adsCancel', 'vast.adSkip'], removeAdsLabel);

    if (utilities.isIDevice()) {
      preventManualProgress();
    }

    player.vast.vastResponse = vastResponse;
    logger.debug ("calling adIntegrator.playAd() with vastResponse:", vastResponse);
    player.vast.adUnit = adIntegrator.playAd(vastResponse, callback);

    /*** Local functions ****/
    function addAdsLabel() {
      if (adFinished || player.controlBar.getChild('AdsLabel')) {
        return;
      }

      player.controlBar.addChild('AdsLabel');
    }

    function removeAdsLabel() {
      player.controlBar.removeChild('AdsLabel');
      adFinished = true;
    }

    function preventManualProgress() {
      //IOS video clock is very unreliable and we need a 3 seconds threshold to ensure that the user forwarded/rewound the ad
      var PROGRESS_THRESHOLD = 3;
      var previousTime = 0;
      var skipad_attempts = 0;

      player.on('timeupdate', preventAdSeek);
      player.on('ended', preventAdSkip);

      playerUtils.once(player, ['vast.adEnd', 'vast.adsCancel', 'vast.adError', 'vast.adSkip'], stopPreventManualProgress);

      /*** Local functions ***/
      function preventAdSkip() {
        // Ignore ended event if the Ad time was not 'near' the end
        // and revert time to the previous 'valid' time
        if ((player.duration() - previousTime) > PROGRESS_THRESHOLD) {
          player.pause(true); // this reduce the video jitter if the IOS skip button is pressed
          player.play(true); // we need to trigger the play to put the video element back in a valid state
          player.currentTime(previousTime);
        }
      }

      function preventAdSeek() {
        var currentTime = player.currentTime();
        var progressDelta = Math.abs(currentTime - previousTime);
        if (progressDelta > PROGRESS_THRESHOLD) {
          skipad_attempts += 1;
          if (skipad_attempts >= 2) {
            player.pause(true);
          }
          player.currentTime(previousTime);
        } else {
          previousTime = currentTime;
        }
      }

      function stopPreventManualProgress() {
        player.off('timeupdate', preventAdSeek);
        player.off('ended', preventAdSkip);
      }
    }
  }

  function trackAdError(error, vastResponse) {
    player.trigger({type: 'vast.adError', error: error});
    
    if (adsRemaining === 0 || !settings.adsEnabled) {
      cancelAds();  
    } else {
      skipAd();
    }
    
    logger.error ('AD ERROR:', error.message, error, vastResponse);
  }

  function isVPAID(vastResponse) {
    var i, len;
    var mediaFiles = vastResponse.mediaFiles;
    for (i = 0, len = mediaFiles.length; i < len; i++) {
      if (vastUtil.isVPAID(mediaFiles[i])) {
        return true;
      }
    }
    return false;
  }
};