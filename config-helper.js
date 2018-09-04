"use strict";

const defaultConfig = require('./default-config.json');

const profiles = require('./profiles.json')
const {TreeMap, TreeSet} = require("jstreemap");
const fs = require("fs");

var archivedConfig;     // Assigned to the module scope, so I'm okay with this.

/**
 * Loads the user's configuration file. Any field present in the user's config will overwrite that of the default configuration.
 * The license white list profile will also be loaded into the config option at this time.
 * 
 * @param {string} pathToConfigFile Path to the user's config file. If the config file does not exist or is not valid JSON, the user
 * will be notified and the default configuration will be used.
 * 
 * @return A fully iniitalised config option.
 */
function loadConfig(pathToConfigFile) {
    // Default config is loaded due to being required 
    var config = defaultConfig;

    // If the user has provided a config file, load that one and overwrite anything within config. 
    if (pathToConfigFile) {
        try {
            let userConfig = fs.readFileSync(pathToConfigFile); 
            userConfig = JSON.parse(userConfig);        // Parse that bad boy

            // Overwrite field from the default config with the one in user config.
            for (let field in userConfig) {
                config[field] = userConfig[field];      
            }
        }
        catch (err) {
            process.stderr.write(`Provided Config File: ${userConfig} does not exist or is not valid JSON\n`);
            console.log("Using Default Configuration Only");
        }
    }

    // Load the user's license profile
    loadLicenseProfile(config.license);

    // For better performance we convert many fields of the config to 
    // TreeMaps or TreeSets.
    convertToTree(config);

    archivedConfig = config;

    return config
}

/**
 * Loads the white list of the user's desired license profile into the configuration 
 * object. Should the profile defined in the config file not be found in profiles.jsonc,
 * only the white list defined in the config option will be used. 
 * 
 * @param {object} licenseConfig The license object within the user's configuration.
 */
function loadLicenseProfile(licenseConfig) {
    var profileWhiteList;
    try {
        profileWhiteList = profiles[licenseConfig.profile].whiteList;
    }
    catch (err) {
        // If no white list for the profile, inform the user
        console.log(`No white list could be found for the profile ${licenseConfig.profile}.`);
        console.log("Continuing only with white list found in the config file...");
        return;
    }

    // The white list in license config will, most of the time be smaller so this is a more
    // efficient way then doing pushing in place.
    profileWhiteList.push(...licenseConfig.whiteList);
    licenseConfig.whiteList = profileWhiteList;
    

    // No need to return. Object has been modified in place
}

function convertToTree(config) {
    config.license.whiteList = new TreeSet(config.license.whiteList);
    config.license.exceptions = new TreeSet(config.license.exceptions);
    config.license.alternateLocations = new TreeMap(config.license.alternateLocations);

    // Don't waste time and space if we won't use them...
    if (config.cryptography.enable) {
        config.cryptography.packageList = new TreeSet(config.cryptography.packageList);
        config.cryptography.exceptions = new TreeSet(config.cryptography.exceptions);
    }

    for (let project of config.targetDirectories) {
        project.ignore = new TreeSet(project.ignore);
    }

    config.ignoreDirectories = new TreeSet(config.ignoreDirectories);

    // No need to return, pass by reference
}

/**
 * @return Licence info within the Config File
 */
function getLicense() {
    return archivedConfig.license;
}

/**
 * @return Output File for the Package Report
 */
function getOutputFile() {
    return archivedConfig.outputFile;
}

/**
 * @return True if we are to analyse the build tools, false otherwise
 */
function getAnalyseBuildTools() {
    return archivedConfig.analyseBuildTools;
}

/**
 * @return Cryptography info within the Config File
 */
function getCryptography() {
    return archivedConfig.cryptography;
}

/**
 * @return List with information about the directories we're to analyse
 */
function getTargetDirectories() {
    return archivedConfig.targetDirectories;
}

/**
 * @return List containing information on the fields to include within the reports.
 */
function getReportFields() {
    return archivedConfig.reportFields;
}

/**
 * @return List of the directories to be ignored
 */
function getIgnoreDirectories() {
    return archivedConfig.ignoreDirectories;
}

module.exports = {
    loadConfig: loadConfig,
    getLicense: getLicense,
    getOutputFile: getOutputFile,
    getAnalyseBuildTools: getAnalyseBuildTools,
    getCryptography: getCryptography,
    getTargetDirectories: getTargetDirectories,
    getReportFields: getReportFields,
    getIgnoreDirectories: getIgnoreDirectories
}