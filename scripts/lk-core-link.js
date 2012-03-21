/*global require, module, process, console, JSON, __dirname, setTimeout*/

/*
 * Script for linking the lk core to webwerkstatt
 *
 * Run it like that:
 *
 * node scripts/link-core.js -t 2.1.2 \
 *   --lk-dir /Users/robert/Lively/core-link/lk/ \
 *   --ww-dir /Users/robert/Lively/core-link/ww/
 *
 */


var args           = require('./helper/args'),
    fs             = require('fs'),
    shell          = require('./helper/shell'),
    exec           = require('child_process').exec,
    colorize       = require('colorize'),
    console        = colorize.console,
    Seq            = require('seq'),
    env            = process.env,
    calledDirectly = require.main === module;

// -=-=-=-=-=-=-=-=-=-=-
// script options
// -=-=-=-=-=-=-=-=-=-=-
var options = args.options([
    ['-h', '--help', 'foo'],
    ['-t', '--tag TAG', 'New version tag'],
    ['--lk-dir DIR', 'Path to Lively-Kernel repository'],
    ['--ww-dir DIR', 'Path to Lively-Kernel repository']],
    {},
"Make a new version of LivelyKernel core (specified by '--tag') and link that "
+ "new version  to webwerstatt.\n"
+ "This operates on local LivelyKernel core and webwerkstatt repositories "
+ "that are specified by '--lk-dir' and '--ww-dir'. The script will\n\n"
+ "1. Update both repos\n"
+ "2. Ask you to update the change log (release documentation, History.md)\n"
+ "3. Update the version file (coreVersion.json)\n"
+ "4. Update npm package file (package.json)\n"
+ "5. Syncing the core source code with the webwerksatt code (uses `lk sync`)\n"
+ "6. Tag the git core reposiory with the new version.\n\n"
+ "To really make the changes on the remote repositories you will have to"
+ " run 'git push' and 'svn commit' afterwards");

if (!options.wwDir && env.WORKSPACE_WW_EXISTS) {
    options.wwDir = env.WORKSPACE_WW;
}

if (!options.lkDir && env.WORKSPACE_LK_EXISTS) {
    options.lkDir = env.WORKSPACE_LK;
}

if (calledDirectly) {
  if (!options.lkDir || !options.wwDir || !options.tag) options.showHelpAndExit();
}

// those things are fixed for now
options.lkCore             = options.lkDir + '/core/';
options.changeLogFile      = options.lkDir + '/History.md';
options.changeLogInputFile = options.lkDir + '/changes-' + options.tag + '.md';
options.npmPackageFile     = options.lkDir + '/package.json';
options.wwCore             = options.wwDir + '/core/';
options.versionFile        = options.wwCore + 'coreVersion.json';


// -=-=-=-=-=-=-=-=-=-=-
// changelog helpers
// -=-=-=-=-=-=-=-=-=-=-
function changeLogEntryTemplate(tag, date) {
    var templ = tag + ' / ';
    templ += date.toISOString().replace(/T.*/, '');
    templ += '\n' + new Array(templ.length + 1).join('=');
    templ += '\n\n  * Describe what has changed....';
    return templ;
}

function embedInChangeLog(descr, logFile, callback) {
    // newline cleanup
    descr = descr.toString().
        replace(/^\n*/, '').
        replace(/\n*$/, '') + '\n';
    // using cat and tmp file for prepend
    var logFileTmp = logFile + '.tmp',
        cmd = ['{ echo "', descr, '"; cat ', logFile, '; } > ', logFileTmp,
               '; mv ', logFileTmp, ' ', logFile].join('');
    exec(cmd, callback);
}


// -=-=-=-=-=-=-=-=-=-=-
// svn helpers
// -=-=-=-=-=-=-=-=-=-=-
function getSVNRev(callback) {
    var next = this;
    exec('svn info | ' +
         'grep "Last Changed Rev:" | ' +
         'sed "s/^[^0-9]*\\([0-9]*\\)/\\1/g"',
         {cwd: options.wwDir}, callback);
}


// -=-=-=-=-=-=-=-=-=-=-
// package.json
// -=-=-=-=-=-=-=-=-=-=-
function updatePackageJSON(fs, whenDone) {
    var file = options.lkDir + '/package.json';
    fs.readFile(file, function(err, data) {
        var json = JSON.parse(data);
        json.version = options.tag;
        fs.writeFile(file, JSON.stringify(json, null, 2), whenDone);
    });
}

// -=-=-=-=-=-=-=-=-=-=-
// git helpers
// -=-=-=-=-=-=-=-=-=-=-

// var lastTag;
// function findLastTag() {
//     shell.runV('git tag', function(out) {
//         lastTag = out.split('\n').sort().reverse()[0];
//     }, {cwd: options.lkRepo});
// }


// -=-=-=-=-=-=-=-=-=-=-
// generic helpers
// -=-=-=-=-=-=-=-=-=-=-
function execLogger(cmd) {
    return function(out, err) {
        var msg = "#bold[" + cmd + "]";
        if ((out && out !== "") || (err && err !== "")) msg += ":\n";
        if (out && out !== "") msg += out;
        if (err && err !== "") msg += "#red[" +  err + "]";
        console.log(msg);
        this();
    }
}

function logger(msg) {
    return function() { console.log(msg); this(); }
}

function wait(ms) { return function() { setTimeout(this, ms) } }


if (calledDirectly) {

// -=-=-=-=-=-=-=-=-=-=-
// the real thing
// -=-=-=-=-=-=-=-=-=-=-
console.log('\n#bold[Link process started:] Will link version ' + options.tag +
            ' of core repo #blue[' + options.lkDir + '] to #blue[' + options.wwDir + ']');

Seq()
// ==== update ====
.seq(logger('\n#bold[1. Doing `svn up` and `git pull`]'))
.seq(wait(500))
.seq(exec, 'svn up', {cwd: options.wwCore}, Seq)
.seq(execLogger('svn up'))
.seq(exec, 'git co master; git pull --rebase', {cwd: options.lkDir}, Seq)
.seq(execLogger('git co + pull'))

// ==== change log ====
.seq(logger('\n#underline[2. Updating change log (' + options.changeLogFile + ')]'))
.seq(wait(500))
.seq(fs.writeFile, options.changeLogInputFile,
     changeLogEntryTemplate(options.tag, new Date()), Seq)
.seq(logger('Please edit the change log in the editor that will open...'))
.seq(wait(3000))
.seq(shell.call, __dirname + '/helper/edit-changelog.sh', [options.changeLogInputFile], Seq)
.seq(fs.readFile, options.changeLogInputFile, Seq)
.seq(function(changes) { embedInChangeLog(changes, options.changeLogFile, this) })
.seq(fs.unlink, options.changeLogInputFile, Seq)

// ==== version file ====
.seq(logger('\n#underline[3. Updating version file (' + options.versionFile + ')]'))
.seq(wait(1000))
.seq(getSVNRev, Seq)
.seq(function(svnRev) {
    var info = {
        "coreVersion": options.tag,
        "svnRevision": svnRev.toString().replace(/\n/,'')
    }
    var json = JSON.stringify(info, null, 2);
    console.log("New version file content:\n" + json);
    fs.writeFile(options.versionFile, json, this);
})

// ==== Update package.json ====
.seq(logger('\n#underline[4. Update package.json]'))
.seq(wait(2000))
.seq(updatePackageJSON, fs, Seq)
.seq(execLogger('package.json'))

// ==== synching ww with lk ====
.seq(logger('\n#underline[5. Syncing changes from LivelyKernel to webwerksatt]'))
.seq(wait(2000))
.seq(exec, [env.LK_SCRIPTS_ROOT + "/bin/lk sync --from-lk-to-ww " +
          "--lk-dir ", options.lkDir, " --ww-dir ", options.wwDir].join(''), Seq)
.seq(exec, 'svn status', {cwd: options.wwCore}, Seq)
.seq(execLogger('svn status'))
.seq(logger('\nSee #blue[svn diff ' + options.wwDir + ']' +
           ' for a full list of changes'))

// ==== tag ====
.seq(logger('\n#underline[6. Running `git tag ' + options.tag + '`]'))
.seq(wait(2000))
.seq(exec, 'git tag ' + options.tag, {cwd: options.lkCore}, Seq)

// ==== final Message ====
.seq(logger('\n#bold[Remaining manual steps]\n' +
            '1. Visit #blue[' + options.lkDir + ']\n   and run #blue[git push && git push tags] ' +
            'to commit the new change log and the new tag.\n2. In ' +
           '#blue[' + options.wwDir + ']\n   run #blue[svn st] and #blue[svn diff] to review ' +
           'and modify the changes (if required).\n3. Run the tests.\n' +
            '4. Run #blue[svn commit] to upload the changes to webwerkstatt.\n\nThats it! The new core is linked.\n\n' +
           '#yellow[== NOTE ==]\nIf you want to reset the changes run\n ' +
            '#blue[cd ' + options.lkDir + ' && ' + 'git tag ' + options.tag + ' -d && git reset --hard]' +
           '\nand\n #blue[svn revert ' + options.wwCore + ' -R]'))
.seq(function() { process.exit(0) });

} // end if invokedFromShell


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// tests below
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// nodemon node_modules/nodeunit/bin/nodeunit scripts/lk-core-link.js
var UpdatePackageJSONTest = {
    setUp: function(callback) {
        var packageJSONString = "{\n"
                               + "\"author\": \"The Lively Kernel...\",\n"
                               + "\"name\": \"livelykernel-scripts\",\n"
                               + "\"version\": \"0.0.1\"\n"
                               + "}";
        this.fs = {
            readFile: function(filename, cb) {
                this.readFileName = filename;
                cb(0, packageJSONString);
            },
            writeFile: function(filename, data, cb) {
                this.writeFileName = filename;
                this.writtenString = data;
                cb(0, '', '');
            }
        };
        callback();
    },
    testUpdatePackageJSONWithNewTag: function(test) {
        var fs = this.fs,
            expected = "{\n"
                     + "  \"author\": \"The Lively Kernel...\",\n"
                     + "  \"name\": \"livelykernel-scripts\",\n"
                     + "  \"version\": \"3.1.4\"\n"
                     + "}";
        options.lkDir = 'foo/bar';
        options.tag = '3.1.4';
        updatePackageJSON(this.fs, function() {
            test.equal(fs.readFileName, 'foo/bar/package.json', 'filename read');
            test.equal(fs.writeFileName, 'foo/bar/package.json', 'filename write');
            test.equal(fs.writtenString, expected, 'package.json not correctly updated');
            test.done();
        });
    }
}

module.exports = UpdatePackageJSONTest;