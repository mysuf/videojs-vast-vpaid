'use strict';

var path = require('path');
var parseArgs = require('minimist');

var options = parseArgs(process.argv.slice(2), {
  string: 'env',
  default: {env: process.env.NODE_ENV || 'development'}
});

var demoAds = [
  {
  url:'http://rtr.innovid.com/r1.5554946ab01d97.36996823;cb=%25%CACHEBUSTER%25%25',
  label:'VPAID Html5 Innovid test tag'
  }
];

module.exports = {

  videojsSrc: 'node_modules/video.js/dist/video.js',

  options: options,
  env: options.env,
  git: {
    remoteUrl: process.env.GH_TOKEN ? 'https://'+process.env.GH_TOKEN+'@github.com/mysuf/videojs-vast-vpaid' : 'origin'
  },

  DIST: path.normalize('__dirname/../dist'),
  DEV: path.normalize('__dirname/../dev'),
  TMP: path.normalize('__dirname/../tmp'),

  vendor: [

  ],

  testFiles: function testFiles (){
    var dependencies = [];

    this.vendor.forEach(function(bundle){
      dependencies.push({
        pattern: bundle,
        included: /\.js$/.test(bundle)
      });
    });
    //We add videojs
    dependencies.push(this.videojsSrc);
    return dependencies.concat([
      'test/test-utils.css',
      'test/**/*.spec.js'
    ]);
  },

  demoAds: demoAds
};


