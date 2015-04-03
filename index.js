var child = require('child_process');
var chokidar = require('chokidar');
var fs = require('fs');
var http = require('http');
var mime = require('mime');
var path = require('path');
var rdbg = require('rdbg');
var util = require('util');
var temp = require('temp');

function serve(options, callback) {
  var server = http.createServer(function(request, response) {
    if (request.url == '/') {
      response.setHeader('content-type', 'text/html');
      response.write('<!doctype html><head><meta charset="utf-8"></head><body>');

      for (var key in options.scripts) {
        response.write('<script src="' + key + '"></script>');
      }

      response.end('</body>');
    } else {
      var filename = options.scripts[path.basename(request.url)];
      if (!filename) {
        var filename = path.join(options.cwd, request.url);
      }

      fs.exists(filename, function(exists) {
        if (exists) {
          response.setHeader('content-type', mime.lookup(filename));
          response.writeHead(200);

          var file = fs.createReadStream(filename);
          file.pipe(response);
        } else {
          response.writeHead(404);
          response.end('404');
        }
      });
    }
  });

  server.listen(options.port, options.host, callback);
  return server;
}

function compile(options, callback) {
  switch (options.compiler) {
    case 'browserify':
      var command = 'watchify';
      var args = [
        '-o',
        options.output,
      ];
      break;

    case 'webpack':
      var command = 'webpack';
      var args = [
        '--watch',
        '--output-file',
        options.output,
      ];
      break;

    case 'typescript':
      var command = 'tsc';
      var args = [
        '--watch',
        '--out',
        options.output,
      ];
      break;

    case 'coffeescript':
      var command = 'coffee';
      var args = [
        '--watch',
        '--out',
        options.output,
      ];
      break;


    default:
      var args = options.compiler.match(/'[^"]*'|"[^"]*"|\S+/g);
      var command = args.shift();
      break;
  }

  args = args.concat(options.args);

  var compiler = child.spawn(command, args);
  process.nextTick(function() {
    callback(null, compiler.stdout, compiler.stderr);
  });

  return compiler;
}

function watch(options, callback) {
  var files = Object.keys(options.scripts).map(function(key) {
    return path.dirname(options.scripts[key]);
  });

  var watcher = chokidar.watch(files, {
    persistent: true
  });

  if (callback) {
    watcher.once('ready', callback);
  }

  return watcher;
}

function debug(options, callback) {
  var bugger = rdbg.connect(options.debuggerPort, options.debuggerHost, function(target) {
    callback(null, target);
  });

  bugger.targets(function(targets) {
    var target = targets.filter(function(target) {
      return target.url.indexOf(options.host) > -1 && target.webSocketDebuggerUrl;
    })[0];

    bugger.attach(target);
  });

  return bugger;
}

function open(options, callback) {
  switch (options.client) {
    case 'chrome':
      var command = (function() {
        if (process.platform == 'win32') {
          var suffix = '\\Google\\Chrome\\Application\\chrome.exe';
          var prefixes = [
            process.env['LOCALAPPDATA'],
            process.env['PROGRAMFILES'],
            process.env['PROGRAMFILES(X86)'],
          ];

          var executables = prefixes.map(function(prefix) {
            return prefix + suffix;
          }).filter(function(path) {
            return fs.existsSync(path);
          });

          return executables[0];
        } else if (process.platform == 'darwin') {
          return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else {
          return 'google-chrome';
        }
      }());

      var args = [
        '--remote-debugging-port=' + options.debuggerPort,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-translate',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-zero-browsers-open-for-tests',
        '--user-data-dir=' + temp.mkdirSync('amok-chrome'),
      ];
      break;

    default:
      var args = options.client.match(/'[^"]*'|"[^"]*"|\S+/g);
      var command = args.shift();
      break;
  }

  var url = util.format('http://%s:%d', options.host, options.port);
  args.push(url);

  var client = child.spawn(command, args);

  process.nextTick(function() {
    callback(null, client.stdout, client.stderr);
  });

  return client;
}

module.exports.serve = serve;
module.exports.watch = watch;
module.exports.compile = compile;
module.exports.debug = debug;
module.exports.open = open;
