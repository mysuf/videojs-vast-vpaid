'use strict';

//var babelify    = require('babelify');
var browserify  = require('browserify');
var buffer      = require('vinyl-buffer');
var clone       = require('gulp-clone');
var concat      = require('gulp-concat');
var css2js      = require('gulp-css-to-js');
var cssnano     = require('gulp-cssnano');
var del         = require('del');
var gulp        = require('gulp');
var insert      = require('gulp-insert');
var jshint      = require('gulp-jshint');
var lazypipe    = require('lazypipe');
var path        = require('path');
var rename      = require('gulp-rename');
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
    'build-plugin',
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

function minifyJs() {
  var cloneSink = clone.sink();

  var lazy = lazypipe()
    .pipe(buffer)
    .pipe(function() {return cloneSink;})
    .pipe(sourcemaps.init, {loadMaps: true})
    .pipe(uglify, {compress: false}) // compress needs to be false otherwise it mess the sourcemaps
    .pipe(rename, {suffix: '.min'})
    .pipe(sourcemaps.write, './')
    .pipe(cloneSink.tap)
    .pipe(gulp.dest, distPath);

  return lazy();
}

function minifyCss() {
  var cloneSink = clone.sink();

  var lazy = lazypipe()
    .pipe(function() {return cloneSink;})
    .pipe(cssnano)
    .pipe(rename, {suffix: '.min'})
    .pipe(sourcemaps.write, './')
    .pipe(cloneSink.tap)
    .pipe(gulp.dest, distPath);

  return lazy();
}

gulp.task('build-plugin', function () {
  var jsSrc = browserify({
      entries: 'src/scripts/plugin/videojs.vast.vpaid.js',
      debug: true,
      paths: ['./node_modules'],
      cache: {},
      packageCache: {}
    })
    .bundle()
    .pipe(source('videojs.vast.vpaid.js'))
    .pipe(buffer());

  var cssJs = gulp.src('src/styles/videojs.vast.vpaid.scss')
    .pipe(sourcemaps.init())
    .pipe(sass()
      .on('error', sass.logError))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(distPath))
    .pipe(minifyCss())
    .pipe(insert.append('/*#sourceMappingURL=/css/videojs.vast.vpaid.css.map*/'))
    .pipe(css2js());

  return mergeStream(cssJs, jsSrc)
    .pipe(concat('videojs.vast.vpaid.js'))
    .pipe(gulp.dest(distPath))
    .pipe(minifyJs())
    .pipe(size({showFiles: true, title: '[Plugin]'}));

});

//includes last version of videojs
gulp.task('build-bundle', function() {
  var videojsPath = 'node_modules/video.js/dist/';
  var videojsPathJS = path.join(videojsPath, 'video.js');
  var videojsPathCss = path.join(videojsPath, 'video-js.css');

  var jsSrc = gulp.src(videojsPathJS);

  var cssJs = gulp.src([videojsPathCss, distPath + 'videojs.vast.vpaid.css'])
    .pipe(concat('videojs.bundle.css'))
    .pipe(sourcemaps.init())
    .pipe(gulp.dest(distPath))
    .pipe(sourcemaps.write())
    .pipe(minifyCss())
    .pipe(insert.append('/*#sourceMappingURL=/css/videojs.bundle.css.map*/'))
    .pipe(css2js());

  var vpaidSrc = gulp.src(path.join(distPath, 'videojs.vast.vpaid.js'));

  return mergeStream(cssJs, jsSrc, vpaidSrc)
    .pipe(concat('video.js'))
    .pipe(gulp.dest(distPath))
    .pipe(minifyJs())
    .pipe(size({showFiles: true, title: '[Bundle]'}));
});

module.exports = new BuildTaskDoc('build', 'This task builds the plugin', 4);
