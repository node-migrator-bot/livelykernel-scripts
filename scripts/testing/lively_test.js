/*global require, console, process, JSON, setTimeout*/
var http     = require('http'),
    colorize = require('colorize'),
    config   = require('./config'),
    optparse = require('optparse'),
    path     = require('path'),
    exec     = require('child_process').exec,
    env      = require('../env'),
    shell    = require('../helper/shell');

////////////////////////////////////////////////////////
// Parse the command line options and merge them with //
// config settings                                    //
////////////////////////////////////////////////////////

// for option parser help see https://github.com/jfd/optparse-js
var platformConf = config.platformConfigs[process.platform],
    supportedBrowsers = Object.keys(platformConf),
    defaultBrowser = env.LK_TEST_BROWSER,
    switches = [
        ['-h', '--help', "Shows this help section."],
        ['-v', '--verbose', "Print progress and debug information."],
        ['-b', '--browser NAME', "Which browser to use. Options are \""
                               + supportedBrowsers.join('", "')
                               + "\". If not specified then \""
                               + defaultBrowser + "\" is used."],
        ['-n', '--notifier NAME', "Use a system notifier to output results. "
                                + "Currently \"" + env.LK_TEST_NOTIFIER
                                + "\" is supported."],
        ['-m', '--modules NAMES', "Additional modules to load, comma separated"],
        ['-d', '--display NUMBER', 'Secify a display id for running chrome with xvfb'],
        ['-f', '--focus FILTER', "A filter is a string that can have three"
                               + "parts separated by \"|\". All parts define"
                               + " JS regexps.\n\t\t\t\tThe first is for "
                               + "matching test modules to load, the second "
                               + "matches test classes, the third test method"
                               + "names.\n\t\t\t\tExample: "
                               + "\"testframework|.*|filter\" will only run "
                               + "those tests that are in modules matching "
                               + "'testframework' and are\n\t\t\t\tdefined in"
                               + "those test methods that match 'filter'."],
        ['--test-script FILE', "Script file that is sent to the browser and "
                             + "runs the tests. If not specified then \""
                             + env.LK_TEST_WORLD_SCRIPT + "\" is used."]],
    parser = new optparse.OptionParser(switches);


// Internal variable to store options.
var options = {
    browserName: defaultBrowser,
    browserConf: platformConf[defaultBrowser],
    notifier: null,
    testScript: env.LK_TEST_WORLD_SCRIPT,
    testWorld: env.LK_TEST_WORLD,
    verbose: false,
    maxRequests: env.LK_TEST_TIMEOUT,
    testFilter: null,
    display: null
};

parser.on("help", function() {
    console.log(parser.toString());
    process.exit(0);
});

parser.on("verbose", function() { options.verbose = true; });

parser.on("browser", function(name, value) {
    console.assert(supportedBrowsers.indexOf(value) >= 0,
                  "Unsupported browser: " + value);
    options.browserName = value;
    options.browserConf = platformConf[value];
});

parser.on("notifier", function(name, value) {
    console.assert(env.LK_TEST_NOTIFIER === value,
                  "Unsupported notifier: " + value);
    options.notifier = value;
});

parser.on("test-script", function(name, value) {
    options.testScript = value;
});

parser.on("focus", function(name, value) {
    options.testFilter = value;
});

parser.on("display", function(name, value) {
    options.display = value;
});

parser.on("modules", function(name, value) {
    options.modules = value;
});

parser.parse(process.argv);

function log(msg) {
    if (options.verbose) console.log(msg);
}

log(options);

///////////////////////////////////////////////////////////
// Start/stop browser                                    //
///////////////////////////////////////////////////////////

var browserInterface = {

    open: function(url, options) {
        var browserPath = options.browserConf.path,
            browserArgs = options.browserConf.args;

        if (this.process) {
            this.close();
            setTimeout(function() {
                browserInterface.open(url, options);
            }, 200);
            return;
        }

        if (options.browserConf.tmpDir && path.existsSync(options.browserConf.tmpDir)) {
            exec('rm -rfd ' + options.browserConf.tmpDir, function() {
                console.log('Browser temp dir removed');
                browserInterface.open(url, options);
            });
            return;
        }

        if (options.display) {
            options.env = {'DISPLAY' : options.display};
        }

        console.log('open ' + browserPath + ' on ' + url);
        this.process = shell.callShowOutput(
            browserPath, browserArgs.concat([url]),
            function(code) {
                console.log('Browser closed');
            },
            options);
        this.process.on('exit', function() {
            exec()
        })
    },

    close: function() {
        var self = this;
        // give the browser some time to finish requests
        setTimeout(function() {
            if (self.process) { // sometimes process is already gone?!
                self.process.kill();
            }
            self.process = null;
        }, 100);
    }

};


///////////////////////////////////////////////////////////
// Define functions for server interaction and reporting //
///////////////////////////////////////////////////////////

function getJson(path, callback) {
    var options = {
        host: env.MINISERVER_HOST,
        port: env.MINISERVER_PORT,
        path: path,
        method: 'GET'
    };
    log('GET ' + path);
    var req = http.request(options, function(res) {
        var data = '';
        log('STATUS: ' + res.statusCode);
        log('HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            try {
                var body = JSON.parse(data);
                if (callback) callback(body);
            } catch (e) {
                log('getJson on ' + path);
                log('parse error: ' + data + '\n\n' + e);
            }
        });
    });

    req.on('error', function(e) {
        log('problem with request: ' + e.message);
    });

    req.end();
}

function printResult(testRunId, data) {
    console.log('\n=== test result for test run %s in %s ===',
                testRunId, options.browserName);
    console.log('\nexecution time per test case:');
    data.runtimes.forEach(function(ea) {
       console.log(ea.time + '\t' + ea.module);
    });
    console.log('\n');
    console.log('tests run: ' + data.runs);
    if (data.fails > 0) {
        console.log(colorize.ansify('#red[FAILED]'));
        data.messages.forEach(function(ea) { console.log(ea); });
        console.log(colorize.ansify('#red[' + data.messages.length + ' FAILED]'));
    } else {
        console.log(colorize.ansify('#green[PASSED]'));
    }
}

function notifyResult(testRunId, data) {
    if (!options.notifier) return;
    var msg = (data.fails ? "FAILURE" : 'SUCCCESS') + "\n"
            + data.runs + " tests run, " + data.fails + " failures"
            + "\n" + data.failedTestNames.join("\n");
    shell.callShowOutput(options.notifier, ["--message", msg,
                                            "--identifier", "LivelyCoreTests" + options.testScript,
                                            "--image", "core/media/lively_logo.png"]);
}

// poll
var maxRequests = options.maxRequests, currentRequests = 0;

function pollReport(data) {
    if (currentRequests >= maxRequests) {
        console.log(colorize.ansify('#red[TIMEOUT]'));
        process.exit(2);
        return;
    }
    if (data.state !== 'done') {
        process.stdout.write('.');
        currentRequests++;
        setTimeout(function() {
            getJson('/test-result/' + data.testRunId, pollReport);
        }, 1000);
        return;
    }
    var result = JSON.parse(data.result);
    printResult(data.testRunId, result);
    notifyResult(data.testRunId, result);
    browserInterface.close();
    setTimeout(function() {
        process.exit(result.fails ? 1 : 0);
    }, 200); // 200ms to send SIGKILL to browser
}

function randomId() {
    return Math.floor(Math.random() * 1000);
}

function testWorldUrl(id) {
    return 'http://' + env.MINISERVER_HOST + ':' + env.MINISERVER_PORT + '/' + options.testWorld +
        '?testRunId=' + id +
        (options.testScript ? "&loadScript=" + escape(options.testScript) : '') +
        (options.testFilter ? "&testFilter=" + escape(options.testFilter) : '') +
        (options.modules ? "&additionalModules=" + escape(options.modules) : '');
}

function startTests() {
    var id = randomId();
    browserInterface.open(testWorldUrl(id) , options);
    pollReport({testRunId: id});
}

startTests();
