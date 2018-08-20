'use strict';

const DependencyInfo = require('./dependency-info');
const LockParser = require('./lock-parser');
const FsInspector = require('./fs-inspector');

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
        for (let [name, version, info] of DependencyInfo.forEach(this.infos)) {
            if (info.prod) {
                DependencyInfo.addInfo(projInfos, info);
            }
            else {
                DependencyInfo.addInfo(devInfos, info);
            }
        }
        return [projInfos, devInfos];
    }

    run() {
        let topFileInfos = new TreeMap();
        let modulesPath = this.project.parentDirectory;
        
        // If it is a project, append the path onto node modules
        if (this.project.isProject) {
            modulesPath = `${this.project.parentDirectory}/node_modules`
        }
        if (this.project.userDefinedDependency) {
            let dependencyInfo = fs.readFileSync(this.project.userDefinedDependency);
            dependencyInfo = JSON.parse(dependencyInfo);

            dependencyInfo = new TreeMap(dependencyInfo.dependencies);

            FsInspector.processUserDefinedDirectory(this.project.name, modulesPath, this.project.ignore, topFileInfos, dependencyInfo);
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
        this.flattenInfos(topFileInfos, this.infos);
    }
};

module.exports = Collector;