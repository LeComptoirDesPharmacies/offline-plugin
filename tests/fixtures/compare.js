var dircompare = require('dir-compare');
var path = require('path');
var fs = require('fs');
var { copySync, mkdirpSync } = require('fs-extra');
var del = require('del');
// var format = require('util').format;
var diff = require('diff');
var chalk = require('chalk');
var highlight = require('cli-highlight').highlight
var log = console.log;

var isFix = process.argv.some(arg => arg === '--fix');

var options = {
  compareContent: true,
  excludeFilter: '.DS_Store,manifest.html'
};

function logFile(file, state) {
  log('  * ' + chalk.underline(file) + ' ' + state);
}

module.exports = function(testDir) {
  // log('');

  if (isFix) {
    log(chalk.inverse('Fixing: ' + path.basename(testDir)));
  } else {
    log(chalk.inverse('Comparing: ' + path.basename(testDir)));
  }

  log('');

  var expectedFolder = path.join(testDir, '__expected');
  var outputFolder = path.join(testDir, '__output');

  try {
    fs.accessSync(expectedFolder);
  } catch (e) {
    if (isFix) {
      mkdirpSync(expectedFolder);
    } else {
      return Promise.resolve();
    }
  }

  var res = dircompare.compareSync(
    expectedFolder,
    outputFolder,
    options
  );

  if (isFix) {
    res.diffSet.forEach(function (entry) {
      var name1 = entry.name1 || '';
      var name2 = entry.name2 || '';

      // When a file exists only on one side (right/left), dir-compare leaves
      // the opposite side's `pathN` undefined. Mirror it from the side we
      // know so we can address the equivalent location.
      var relativeDir = (entry.relativePath || '').replace(/^\//, '');
      var path1 = entry.path1 || path.join(expectedFolder, relativeDir);
      var path2 = entry.path2 || path.join(outputFolder, relativeDir);

      if (entry.state === 'equal') {
        // Do nothing
      } else if (entry.state === 'left') {
        del.sync(path.join(path1, name1));
        logFile(path.join(relativeDir, name1), chalk.red('[removed]'));
      } else if (entry.state === 'right') {
        copySync(path.join(path2, name2), path.join(path1, name2));
        logFile(path.join(relativeDir, name2), chalk.green('[added]'));
      } else if (entry.state === 'distinct') {
        copySync(path.join(path2, name2), path.join(path1, name1));
        logFile(path.join(relativeDir, name1), chalk.yellow('[updated]'));
      }
    });
  } else {
    res.diffSet.forEach(function (entry) {
      var name1 = entry.name1 || '';
      var name2 = entry.name2 || '';

      if (entry.state === 'equal') {
        // logFile(name1, chalk.green('[equal]'));
      } else if (entry.state === 'left') {
        logFile(name1, chalk.red('[missing]'));
      } else if (entry.state === 'right') {
        logFile(name2, chalk.red('[redundant]'));
      } else if (entry.state === 'distinct') {
        logFile(name2, chalk.red('[diff]'));

        var patch = diff.createPatch(
          name1,
          fs.readFileSync(path.join(entry.path1, name1), 'utf-8'),
          fs.readFileSync(path.join(entry.path2, name2), 'utf-8'),
          '__expected',
          '__output'
        );

        patch = highlight(patch, {
          language: 'diff'
        });

        patch = patch.trim().split('\n').slice(2).map(function(line) {
          return '      ' + line;
        }).join('\n');

        log('');
        log(patch);
        log('');
      }

      // console.log(entry);
      // console.log(format('%s(%s) %s %s(%s)', name1, entry.type1, state, name2, entry.type2));
    });
  }

  if (!res.same && !isFix) {
    return Promise.reject();
  }

  return Promise.resolve();
}