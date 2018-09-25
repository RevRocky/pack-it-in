#!/usr/bin/env node

'use strict';

const Collector = require('./collector');
const Validator = require('./validator');
const ExcelReporter = require('./excel-reporter');
const ConfigHelper = require('./config-helper');

const parseArgs = require("minimist");
const child_process = require('child_process');
const {TreeSet} = require("jstreemap");

/**
 * Processes the modules associated with a particular project.
 * 
 * @param {object} project An object describing the project being processed
 * @param {Collector} totals An object tracking the each of the node modules and their licence 
 * information that have been discovered so far.
 */
function processProject(project, totals) {
    // eslint-disable-next-line no-console
    console.log(`INSPECTING ${project.name} MODULES`);
    let projectCollector = new Collector(project);
    projectCollector.run();
    totals.mergeWith(projectCollector);
}

/**
 * Retrieves the directory of npm.
 * 
 * @return {string} The root directory of the user's npm installation
 */
function getNodeModulesDirectory() {
    let npmOutput = child_process.execSync('npm root -g').toString();
    let modulesDir = npmOutput.trim();
    return modulesDir;
}

function main() {
    // eslint-disable-next-line no-console
    console.log("Pack-It-In");

    var args = parseArgs(process.argv.slice(2));        // Slice off the node and script name.
    args.config = args.config ? args.config : args.c;   // We don't know whether the user will use the short or long flag.

    // Load Config
    var config = ConfigHelper.loadConfig(args.config);

    let totalCollector = new Collector();

    // Analyse the build tools only if user asks us to...
    if (config.analyseBuildTools) {
        
        // Node project is special and hard-coded.
        let project = {
            name: "NODE",
            parentDirectory: getNodeModulesDirectory(),
            isProject: false,
            hasPackage: false,
            isDev: true,
            ignoreDevDependencies: false,   // It would be silly since these are all dev dependencies
            ignore: new TreeSet()
        }
        processProject(project, totalCollector);
    }

    for (let project of config.targetDirectories) {
        processProject(project, totalCollector);
    }

    // validate licenses and dependencies using encryption
    Validator.reviewLicenses(totalCollector.infos, config.license);

    if (config.cryptography.enable) {
        Validator.reviewEncryption(totalCollector.infos, config.cryptography);
    }
    

    // separate build time dependencies from production dependecies
    let [projInfos, devInfos] = totalCollector.splitDevInfos();

    // build Excel report
    // eslint-disable-next-line no-console
    console.log(`Writing Report to Disk @ ${config.outputFile}`);

    // TODO: Change report type based on config. 
    ExcelReporter.createReport(projInfos, devInfos, config.reportFields, config.outputFile);
    
    // eslint-disable-next-line no-console
    console.log("Done. Exiting...");
}





main();