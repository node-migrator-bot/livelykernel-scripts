/*global exports, require, JSON*/

// continously run with:
// nodemon node_modules/nodeunit/bin/nodeunit minimal_server/serve_test.js

var server = require('./serve'),
    TestHandler = server.TestHandler,
    testSuite = {};


/*
 * requesting test run
 */
var handler, request, spawn;

/*
 * posting test run status, results
 */
var reportRequest;
testSuite.StatusHandlerTest = {

    setUp: function(run) {
        handler = new TestHandler();
        request = {
            body: {testRunId: 1, testResults: "all ok"}
        };
        reportRequest = {
            body: {testRunId: 1}
        };
        run();
    },

    tearDown: function(run) { TestHandler.resetTestData(); run(); },

    "handle result and report request": function(test) {
        var result = handler.postResult(request.body.testRunId, request.body.testResults);
        test.deepEqual(result, {result: 'ok', testRunId: 1}, 'result');
        var report = handler.getResult(reportRequest.body.testRunId);
        test.deepEqual(report, {testRunId: 1, state: 'done', result: "all ok"}, JSON.stringify(report));
        test.done();
    }
}


exports.testSuite = testSuite;
