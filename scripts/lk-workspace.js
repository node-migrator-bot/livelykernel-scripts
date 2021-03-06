/*global require, process, __dirname, console*/
var args = require('./helper/args'),
    shell = require('./helper/shell'),
    exec = require('child_process').exec,
    Seq = require('seq'),
    path = require('path'),
    env = process.env;


/*
 * Script for automatically managing wokring copies of webwerkstatt and lively core
 */


// -=-=-=-=-=-=-=-=-=-=-
// script options
// -=-=-=-=-=-=-=-=-=-=-;

var options = {
    lkGitUrl: "git@github.com:rksm/LivelyKernel.git",
    lkGitUrlReadOnly: "git://github.com/rksm/LivelyKernel.git",
    lkBranch: "master",
    wwSvnUrl: "http://lively-kernel.org/repository/webwerkstatt/"
};

options = args.options([
    ['-h', '--help', 'show this help'],
    ['--remove', 'completely delete the workspace'],
    ['--reset', 'reset both the svn and git repositories if they exist but do not delete them'],
    ['--github-write-access', 'Initialize the lk core git repo with commit access'],
    ['--checkout-ww', 'create ./workspace/ww/, checked out from ' + options.wwSvnUrl],
    ['--checkout-lk', 'create ./workspace/lk/, checked out from ' + options.lkGitUrl +
     ' on branch ' + options.lkBranch],
    ['--init', 'Do both --checkout-ww and --checkout-lk']], options,
    "Script that manages local copies of the LivelyKernel core "
    + "and webwerksatt repository in " + env.WORKSPACE_DIR + '/');

var actions = [],
    shellOpts = {cwd: env.LK_SCRIPTS_ROOT, env: process.env};


if (options.defined('remove')) {
    actions.push({
        msg: 'clean',
        func: function(next) {
            shell.callShowOutput('rm', ['-rfv', env.WORKSPACE_DIR], next);
        }
    });
}

function svnReset(next) {
    return function() {
        var dir = env.WORKSPACE_WW;
        exec(['if [[ -d ', dir, ' ]]; then cd ', dir, '; svn revert -R .; fi'].join(''),
             shellOpts, next);
    };
}

function gitReset(next) {
    return function() {
        var dir = env.WORKSPACE_LK;
        exec(['if [[ -d ', dir, ' ]]; then cd ', dir, '; ',
              'git reset --hard; git clean -d -f; fi'].join(''),
             shellOpts, next);
    };
}

if (options.defined('reset')) {
    actions.push({
        msg: 'reset',
        func: function(next) {
            Seq()
            .seq(svnReset(gitReset(next))); // hmmm
        }
    });
}

if (options.defined('checkoutLk') || options.defined('init')) {
    var gitURL = options.defined('githubWriteAccess') ?
        options.lkGitUrl : options.lkGitUrlReadOnly;
    actions.push({
        msg: 'git clone ' + gitURL,
        func: function(next) {
            Seq()
            .seq(exec, 'mkdir -p ' + env.WORKSPACE_DIR, shellOpts, Seq)
            .seq(exec, ['git clone -b ', options.lkBranch, ' -- ',
                        gitURL, ' ', env.WORKSPACE_LK].join(''),
                 shellOpts, next);
        }
    });
}

if (options.defined('checkoutWw') || options.defined('init')) {
    actions.push({
        msg: 'svn co ' + options.wwSvnUrl,
        func: function(next) {
            Seq()
            .seq(exec, 'mkdir -p ' + env.WORKSPACE_DIR, shellOpts, Seq)
            .seq(exec, ['svn co ', options.wwSvnUrl + '/core', env.WORKSPACE_WW + '/core'].join(' '),
                 shellOpts, next);
        }
    });
}

var s = Seq();
actions.forEach(function(action) {
    s.seq(function() { console.log('== ' + action.msg + ' =='); action.func(this); });
});