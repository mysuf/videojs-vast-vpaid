'use strict';

//var babelify    = require('babelify');
var browserify  = require('browserify');
var buffer      = require('vinyl-buffer');
var clone       = require('gulp-clone');
//var css2js      = require('gulp-css-to-js');
var cssnano     = require('gulp-cssnano');
var del         = require('del');
var gulp        = require('gulp');
var gulpif      = require('gulp-if');
var jshint      = require('gulp-jshint');
var lazypipe    = require('lazypipe');
//var mergeStream = require('merge-stream');
var path        = require('path');
var rename      = require('gulp-rename');
var runSequence = require('run-sequence');
var sass        = require('gulp-sass');
var size        = require('gulp-size');
var source      = require('vinyl-source-stream');
var sourcemaps  = require('gulp-sourcemaps');
var uglify      = require('gulp-uglify');


var BuildTaskDoc = require('./BuildTaskDoc');
var config       = require('./config');

var devPath      = path.join(config.DEV, '/');
var distPath     = path.join(config.DIST, '/');
var isProduction = config.env === 'production';


gulp.task('build', function (done) {
  runSequence(
    'clean',
    'lintjs',
    'build-plugin-script',
    'build-bundle-script',
    'build-styles',
    'build-assets',
    function (error) {
      if (error) {
        console.log(error.message.red);
      } else {
        console.log('BUILD FINISHED SUCCESSFULLY'.green);
      }
      done(error);
    });
});


gulp.task('clean', function (done) {
  var cleanDirs = [config.DEV];
  if(isProduction){
    cleanDirs.push(config.DIST);
  }
  del.sync(cleanDirs, {force: true});
  done();
});


gulp.task('lintjs', function() {
  return gulp.src([
    'gulpfile.js',
    'src/**/*.js',
    'test/**/*.js',
    'demo/**/*.js',
    'build/**/*.js'
  ])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'));
});


function minifyJs() {
  var cloneSink = clone.sink();

  var process = lazypipe()
    .pipe(buffer)
    .pipe(function() {return cloneSink;})
    .pipe(sourcemaps.init, {loadMaps: true})
    .pipe(uglify, {compress: false}) // compress needs to be false otherwise it mess the sourcemaps
    .pipe(rename, {suffix: '.min'})
    .pipe(sourcemaps.write, './')
    .pipe(cloneSink.tap)
    .pipe(gulp.dest, distPath);

  return process();
}


gulp.task('build-plugin-script', function() {
  var fileName = 'videojs.vast.vpaid.js';
  var entryFile = path.join('src/scripts/plugin', fileName);
  var destPath  = path.join(devPath, 'scripts');

  return browserify({
      entries: entryFile,
      debug: true,
      paths: ['./node_modules'],
      cache: {},
      packageCache: {}
    })
    .bundle()
    .pipe(source(fileName))
    .pipe(gulp.dest(destPath))
    .pipe(gulpif(isProduction, minifyJs()));
});

//includes videojs v6
gulp.task('build-bundle-script', function() {
  var fileName = 'videojs.vast.vpaid.loader.js';
  var entryFile = path.join('src/scripts', fileName);
  var destPath  = path.join(devPath, 'scripts');

  return browserify({
      entries: entryFile,
      debug: true,
      paths: ['./node_modules'],
      cache: {},
      packageCache: {}
    })
    .bundle()
    .pipe(source(fileName))
    .pipe(gulp.dest(destPath))
    .pipe(gulpif(isProduction, minifyJs()));
});

function minifyCss() {
  var cloneSink = clone.sink();

  var process = lazypipe()
    .pipe(function() {return cloneSink;})
    .pipe(cssnano)
    .pipe(rename, {suffix: '.min'})
    .pipe(sourcemaps.write, './')
    .pipe(cloneSink.tap)
    .pipe(gulp.dest, distPath);

  return process();
}

gulp.task('build-styles', function () {

  var entryFile = path.join('src/styles', 'videojs.vast.vpaid.scss');
  var destPath  = path.join(devPath, 'styles');

  return gulp.src(entryFile)
    .pipe(sourcemaps.init())
    .pipe(sass()
      .on('error', sass.logError))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(destPath))
    .pipe(gulpif(isProduction, minifyCss()))
    .pipe(size({showFiles: true, title: '[Styles]'}));

});

gulp.task('build-assets', function () {

  var destPath  = path.join(devPath, 'scripts');

  return gulp.src(config.vendor)
    .pipe(size({showFiles: true, title: '[Assets]'}))
    .pipe(gulp.dest(destPath))
    .pipe(gulpif(isProduction, gulp.dest(distPath)));
});

module.exports = new BuildTaskDoc('build', 'This task builds the plugin', 4);
