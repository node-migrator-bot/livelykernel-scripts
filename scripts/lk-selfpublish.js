/*global require, process*/
var args = require('./helper/args'),
    shell = require('./helper/shell'),
    path = require('path');


// -=-=-=-=-=-=-=-=-=-=-
// script options
// -=-=-=-=-=-=-=-=-=-=-
var env = process.env,
    options = args.options([
        ['-h', '--help', 'Show this help'],
        ['-t', '--tag TAG', 'New version tag, in the form of x.y.z.']],
        {},
        "Publish a new version of livelykernel-sripts");


// -=-=-=-=-=-=-=-=-=-=-
// the real thing
// -=-=-=-=-=-=-=-=-=-=-
var cmdAndArgs = ['node', path.join(env.LK_SCRIPTS_DIR, 'publish.js')];
if (options.defined('tag')) {
    cmdAndArgs.push('--tag');
    cmdAndArgs.push(options.tag);
}
var cmd     = cmdAndArgs[0],
    cmdArgs = cmdAndArgs.slice(1);

shell.run(cmd, cmdArgs, function(code) { process.exit(code); });
