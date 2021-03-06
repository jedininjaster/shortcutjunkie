'use strict';

/**
 * Module dependencies.
 */
var _ = require('lodash'),
    defaultAssets = require('./config/assets/default'),
    testAssets = require('./config/assets/test'),
    gulp = require('gulp'),
    gulpLoadPlugins = require('gulp-load-plugins'),
    runSequence = require('run-sequence'),
    plugins = gulpLoadPlugins();

var minimist = require('minimist');

var args = minimist(process.argv.slice(2), {
    string: 'testFiles'
});

// Set NODE_ENV to 'test'
gulp.task('env:test', function() {
    process.env.NODE_ENV = 'test';
});

// Set NODE_ENV to 'development'
gulp.task('env:dev', function() {
    process.env.NODE_ENV = 'development';
});

// Set NODE_ENV to 'production'
gulp.task('env:prod', function() {
    process.env.NODE_ENV = 'production';
});

// Nodemon task
gulp.task('nodemon', function() {
    return plugins.nodemon({
        script: 'server.js',
        nodeArgs: ['--debug'],
        ext: 'js,html',
        watch: _.union(defaultAssets.server.views, defaultAssets.server.allJS, defaultAssets.server.config)
    });
});

// Watch Files For Changes
gulp.task('watch', function() {
    // Start livereload
    plugins.livereload.listen();

    // Add watch rules
    gulp.watch(defaultAssets.server.views).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.server.allJS, ['jshint']).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.client.views).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.client.js, ['jshint']).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.client.css, ['csslint']).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.client.sass, ['sass', 'csslint']).on('change', plugins.livereload.changed);
    gulp.watch(defaultAssets.client.less, ['less', 'csslint']).on('change', plugins.livereload.changed);
});

// CSS linting task
gulp.task('csslint', function(done) {
    return gulp.src(defaultAssets.client.css)
        .pipe(plugins.csslint('.csslintrc'))
        .pipe(plugins.csslint.reporter())
        .pipe(plugins.csslint.reporter(function(file) {
            if (!file.csslint.errorCount) {
                done();
            }
        }));
});

// JS linting task
gulp.task('jshint', function() {
    return gulp.src(_.union(defaultAssets.server.allJS, defaultAssets.client.js, testAssets.tests.server, testAssets.tests.client, testAssets.tests.e2e))
        .pipe(plugins.jshint())
        .pipe(plugins.jshint.reporter('default'))
        .pipe(plugins.jshint.reporter('fail'));
});


// JS minifying task
gulp.task('uglify', function() {
    return gulp.src(defaultAssets.client.js)
        .pipe(plugins.ngAnnotate())
        .pipe(plugins.uglify({
            mangle: false
        }))
        .pipe(plugins.concat('application.min.js'))
        .pipe(gulp.dest('public/dist'));
});

// CSS minifying task
gulp.task('cssmin', function() {
    return gulp.src(defaultAssets.client.css)
        .pipe(plugins.cssmin())
        .pipe(plugins.concat('application.min.css'))
        .pipe(gulp.dest('public/dist'));
});

// Sass task
gulp.task('sass', function() {
    return gulp.src(defaultAssets.client.sass)
        .pipe(plugins.sass())
        .pipe(plugins.rename(function(path) {
            path.dirname = path.dirname.replace('/scss', '/css');
        }))
        .pipe(gulp.dest('./modules/'));
});

// Less task
gulp.task('less', function() {
    return gulp.src(defaultAssets.client.less)
        .pipe(plugins.less())
        .pipe(plugins.rename(function(path) {
            path.dirname = path.dirname.replace('/less', '/css');
        }))
        .pipe(gulp.dest('./modules/'));
});

// Connect to MongoDB using the mongoose module
gulp.task('mongoose', function(done) {
    var mongoose = require('./config/lib/mongoose.js');

    mongoose.connect(function(db) {
        done();
    });
});

// Mocha tests task
gulp.task('mocha', ['env:test', 'mongoose'], function() {
    var testFiles;
    if (args.testFiles) testFiles = args.testFiles;
    else testFiles = testAssets.tests.server;

    return gulp.src(testFiles)
        .pipe(plugins.mocha({
            reporter: 'spec'
        })).once('end', function() {
            process.exit();
        });
});

// Karma test runner task
gulp.task('karma', ['env:test'], function(done) {
    return gulp.src([])
        .pipe(plugins.karma({
            configFile: 'karma.conf.js',
            action: 'run',
            singleRun: true
        }))
        .on('error', function(err) {
            // Make sure failed tests cause gulp to exit non-zero
            throw err;
        });
});

// Selenium standalone WebDriver update task
gulp.task('webdriver-update', plugins.protractor.webdriver_update);

// Protractor test runner task
gulp.task('protractor', function() {
    gulp.src([])
        .pipe(plugins.protractor.protractor({
            configFile: "protractor.conf.js"
        }))
        .on('error', function(e) {
            throw e
        })
});

// Lint CSS and JavaScript files.
gulp.task('lint', function(done) {
    runSequence('less', 'sass', ['csslint', 'jshint'], done);
});

// Lint project files and minify them into two production files.
gulp.task('build', function(done) {
    runSequence('env:dev', 'lint', ['uglify', 'cssmin'], done);
});

// Run the project tests
gulp.task('test', function(done) {
    runSequence('karma', 'mocha', done);
});

// Run the project in development mode
gulp.task('default', function(done) {
    runSequence('env:dev', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in debug mode
gulp.task('debug', function(done) {
    runSequence('env:dev', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in production mode
gulp.task('prod', function(done) {
    runSequence('build', 'lint', ['nodemon', 'watch'], done);
});

gulp.task('bulk-upload', ['env:prod', 'mongoose'], function(done){
    var uploader = require('./modules/shortcuts/server/bulk.upload/uploader.js');
    uploader.uploadShortcuts(defaultAssets.server.shortcutsDir, done);
});

// Run the project in production mode
gulp.task('migrate-favorites', ['mongoose'], function(done) {
    var mongoose = require('mongoose');
    var Shortcut = mongoose.model('Shortcut');
    var User = mongoose.model('User');

    User.find({
        favorites: {
            $not: {
                $size: 0
            }
        }
    }).populate("favorites").exec(function(err, users) {
        users.forEach(function(user) {
            user.favorites.forEach(function(shortcut) {
                console.log("Incrementing favorite count for shortcut: " + shortcut._id);
                shortcut["favoritesCount"] += 1;
                shortcut.save()
            })
        })
    }).then(function() {
        process.exit()
    });
});
