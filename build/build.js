'use strict';

//var babelify    = require('babelify');
var browserify  = require('browserify');
var buffer      = require('vinyl-buffer');
var concat      = require('gulp-concat');
var css2js      = require('gulp-css-to-js');
var cssnano     = require('gulp-cssnano');
var del         = require('del');
var gulp        = require('gulp');
var ignore      = require('gulp-ignore');
var jshint      = require('gulp-jshint');
var path        = require('path');
var runSequence = require('run-sequence');
var sass        = require('gulp-sass');
var size        = require('gulp-size');
var mergeStream = require('merge-stream');
var source      = require('vinyl-source-stream');
var sourcemaps  = require('gulp-sourcemaps');
var uglify      = require('gulp-uglify');


var BuildTaskDoc = require('./BuildTaskDoc');
var config       = require('./config');

//var devPath      = path.join(config.DEV, '/');
var distPath     = path.join(config.DIST, '/');
var isProduction = config.env === 'production';


gulp.task('build', function (done) {
  runSequence(
    'clean',
    'lintjs',
    'build-bundle',
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


gulp.task('build-vast-plugin-css', function () {
  return gulp.src('src/styles/videojs.vast.vpaid.scss')
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(sass()
      .on('error', sass.logError))
    .pipe(cssnano())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(distPath))
    .pipe(size({showFiles: true, title: '[Plugin CSS]'}));

});

gulp.task('build-vast-plugin-js', function () {
  return browserify({
      entries: 'src/scripts/plugin/videojs.vast.vpaid.js',
      //debug: true,
      paths: ['./node_modules'],
      cache: {},
      packageCache: {}
    })
    .bundle()
    .pipe(source('videojs.vast.vpaid.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify({compress: false})) // compress needs to be false otherwise it mess the sourcemaps
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(distPath))
    .pipe(size({showFiles: true, title: '[Plugin JS]'}));
});

//includes last version of videojs
gulp.task('build-bundle', ['build-vast-plugin-js', 'build-vast-plugin-css'], function() {
  var jsSrc = browserify({
        entries: 'src/scripts/videojs.vast.vpaid.loader.js',
        //debug: true,
        paths: ['./node_modules'],
        cache: {},
        packageCache: {}
    })
    .bundle()
    .pipe(source('video.js'))
    .pipe(buffer());

  var cssVpaid = gulp.src(path.join(distPath, 'videojs.vast.vpaid.css'))
    .pipe(css2js());

  var cssVideo = gulp.src('node_modules/video.js/dist/video-js.css')
    .pipe(sourcemaps.init())
    .pipe(cssnano())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(distPath))
    .pipe(size({showFiles: true, title: '[VideoJS CSS]'}))
    .pipe(ignore.exclude('*.map'))
    .pipe(css2js());

  return mergeStream(cssVideo, cssVpaid, jsSrc)
    .pipe(concat('video.js'))
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify({compress: false})) // compress needs to be false otherwise it mess the sourcemaps
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(distPath))
    .pipe(size({showFiles: true, title: '[VideoJS+Plugin Bundle]'}));

});

module.exports = new BuildTaskDoc('build', 'This task builds the plugin', 4);
