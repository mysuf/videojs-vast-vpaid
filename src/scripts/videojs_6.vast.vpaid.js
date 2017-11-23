'use strict';

require('./plugin/components/ads-label_5');
require('./plugin/components/black-poster_5');

var videoJsVAST = require('./plugin/videojs.vast.vpaid');

var registerPlugin = videojs.registerPlugin || videojs.plugin;
registerPlugin.registerPlugin('vastClient', videoJsVAST);
