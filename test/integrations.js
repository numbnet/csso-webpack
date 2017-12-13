const fs = require('fs');
const async = require('async');
const join = require('path').join;
const exec = require('child_process').exec;
const rimraf = require('rimraf');
const assert = require('assert');

const root = join(__dirname, 'integrations');
const output = join(__dirname, '_out');

const versions = [
    { webpack: '2.3.3', 'extract-text-webpack-plugin': '2.1.0' },
    { webpack: '3.0.0', 'extract-text-webpack-plugin': '3.0.0' },
    { webpack: '3', 'extract-text-webpack-plugin': '3' }
];

const cases = fs.readdirSync(root);

const install = function(version) {
    return new Promise(function (resolve, reject) {
        const start = ['npm i'];
        const cmd = Object.keys(version)
            .map(function (module) {
                delete require.cache[module];
                return module + '@' + version[module];
            })
            .reduce(function (modules, module) {
                return modules.concat(module)
            }, start)
            .join(' ');

        exec(cmd, { cwd: process.cwd() }, function (err) {
            if (err) return reject(err);
            resolve();
        });
    });
};

async.eachSeries(versions, function (version) {
    return install(version).then(function () {
        describe('Integrations with webpack@' + version.webpack, function () {
            this.timeout(5000);

            const webpack = require('webpack');
            const webpackConfig = require('./webpack.config.js');

            rimraf.sync(output);

            cases.forEach(function (testCase) {
                it('with ' + testCase + ' test', function () {
                    return new Promise(function (resolve, reject) {
                        const outputDirectory = join(output, testCase);
                        const testDirectory = join(root, testCase);
                        const configFile = join(testDirectory, 'webpack.config.js');

                        var options = webpackConfig({
                            outputDirectory: outputDirectory,
                            testDirectory: testDirectory
                        });

                        if (fs.existsSync(configFile)) {
                            const testConfig = require(configFile);
                            options = Object.assign({}, options, testConfig, {
                                output: Object.assign({}, options.output, testConfig.output),
                                plugins: options.plugins.concat(testConfig.plugins)
                            });
                        }

                        webpack(options, function (err, stats) {
                            if (err) return reject(err);
                            if (stats.hasErrors()) return reject(new Error(stats.toString()));

                            const expectedCssExt = 'expected.css';

                            fs.readdir(testDirectory, function (err, files) {
                                if (err) return reject(err);

                                files = files.filter(name => name.endsWith(expectedCssExt));

                                assert.ok(files.length > 0, 'Integration test should be with css file');

                                files.forEach(name => {
                                    const prefix = name.substring(0, name.length - expectedCssExt.length) || '';
                                    const actualName = 'test.' + prefix + 'css';

                                    const actual = fs.readFileSync(join(outputDirectory, actualName), 'utf-8')
                                        .replace(/\n$/g, '');

                                    const expected = fs.readFileSync(join(testDirectory, name), 'utf-8')
                                        .replace(/\n$/g, '')
                                        .replace(/%%unit-hash%%/g, stats.hash);

                                    assert.equal(actual, expected,
                                        'Output ' + testCase + ' — ' + name + ' file isn\'t equals ' + actualName
                                    );
                                });

                                resolve();
                            });
                        });
                    });
                });
            });
        });
    }).then(run, run);
});
