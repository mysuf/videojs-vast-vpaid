'use strict';

// require video.js to be loaded
var videojs = require('video.js');

// including version fallbacks
var vjsComponent = videojs.Component || videojs.getComponent('Component');

var AdsLabel = require('./plugin/components/ads-label')(vjsComponent);
var BlackPoster = require('./plugin/components/black-poster')(vjsComponent);

if (videojs.registerComponent) {
	// if videojs v5+
	videojs.registerComponent('AdsLabel', videojs.extend(vjsComponent, AdsLabel));
	videojs.registerComponent('BlackPoster', videojs.extend(vjsComponent, BlackPoster));
} else {
	videojs.AdsLabel = videojs.Component.extend(AdsLabel);
	videojs.BlackPoster = videojs.Component.extend(BlackPoster);
}

var videoJsVAST = require('./plugin/videojs.vast.vpaid');

var registerPlugin = videojs.registerPlugin || videojs.plugin;
registerPlugin('vastClient', videoJsVAST);

window.videojs = videojs;
