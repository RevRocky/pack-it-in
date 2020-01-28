'use strict';

const DependencyInfo = require('./dependency-info');
const LockParser = require('./lock-parser');
const FsInspector = require('./fs-inspector');
const ConfigHelper = require('./config-helper');

const fs = require("fs");
const {TreeMap, TreeSet} = require('jstreemap');

class Collector {
    constructor(project) {
        this.project = project; // No need to duplicate references.
        this.infos = new TreeMap();
    }

    flattenInfos(srcInfos, dstInfos) {
        for (let [name, version, info] of DependencyInfo.forEachRecursively(srcInfos)) {
            DependencyInfo.mergeInfo(dstInfos, info);
        }
    }

    /**
     * Merges a second collector into our collector. 
     * @param {Collector} col A second collector we wish to merge into our collector
     */
    mergeWith(col) {
        for (let [name, version, info] of DependencyInfo.forEach(col.infos)) {
            DependencyInfo.mergeInfo(this.infos, info);
        }
    }


    splitDevInfos() {
        let devInfos = new TreeMap();
        let projInfos = new TreeMap();

        // Get the set of files we wish not to include in the packspec
        const excludeFromPackSpecSet = ConfigHelper.getExcludeFromPackSpecSet();

        for (let [name, version, info] of DependencyInfo.forEach(this.infos)) {
            if (excludeFromPackSpecSet.has(name)) {
                continue;       // We don't want to report this dependency
            }
            else if (info.prod) {
                DependencyInfo.addInfo(projInfos, info);
            }
            else {
                DependencyInfo.addInfo(devInfos, info);
            }
        }
        return [projInfos, devInfos];
    }

    /**
     * Purges all information pertaining to the dev dependencies from our collection of dependency information.
     * Note: This function will only be called if the user has elected to ignoreDevDependencies for a given project.
     * Otherwise, the information about dev dependencies will be maintained and, per usual, written out to the second
     * of the excel spreadsheets.
     * 
     * @param {TreeMap} topFileInfos The collection of all file information for the project.
     */
    purgeDevDependencies(topFileInfos) {
        
        for (const topModuleInfo of topFileInfos) {             // For each module in the project
            for (const versionInfo of topModuleInfo[1]) {       // For each version of the module within the project
                if (versionInfo[1].dev && !versionInfo[1].prod) {     // If it's just a dev dependency, delete it.
                    topModuleInfo[1].delete(versionInfo[0]);
                }
            }
        
            // Check to see if there are aby versions left to speak of...
            if (topModuleInfo[1].size === 0) {
                topFileInfos.delete(topModuleInfo[0]);
            }
        }
    }

    run() {
        let topFileInfos = new TreeMap();
        let modulesPath = this.project.parentDirectory;
        
        // If it is a project, append the path onto node modules
        if (this.project.isProject) {
            modulesPath = `${this.project.parentDirectory}/node_modules`
        }
        if (this.project.userDefinedDependency) {

            // Read the user defined dependency info from the disk.
            let dependencyInfo = fs.readFileSync(this.project.userDefinedDependency);
            dependencyInfo = JSON.parse(dependencyInfo);
            dependencyInfo = new TreeMap(dependencyInfo.dependencies);

            if (this.project.includesNonJSModules) {
                FsInspector.processNonJSModules(this.project.name, this.project.ignore, topFileInfos, dependencyInfo);
            }
            else {    
                // We can assume that the directory supplied follows the rough contours of a node js package maintained with NPM or Yarn
                FsInspector.processUserDefinedDirectory(this.project.name, modulesPath, this.project.ignore, topFileInfos, dependencyInfo);
            }
        }
        else {
            FsInspector.processDirectory(this.project.name, modulesPath, this.project.ignore, topFileInfos);
        }
        
        // Processing the package-lock.json files
        if (this.project.hasPackage) {
            let lockParser = new LockParser(this.project.parentDirectory, topFileInfos);
            lockParser.processLockFile();
        } else {
            for (let [name, version, info] of DependencyInfo.forEach(topFileInfos)) {
                if (this.project.isDev) {
                    info.dev = true;
                }
                else {
                    info.prod = true;
                }
            }
        }
        if (this.project.ignoreDevDependencies) {
            this.purgeDevDependencies(topFileInfos);
        }

        this.flattenInfos(topFileInfos, this.infos);
    }
};

module.exports = Collector;
