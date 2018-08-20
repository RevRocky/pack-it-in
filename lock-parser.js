'use strict';
const fs = require('fs');

class LockParser {
    constructor(path, topFileInfos) {
        this.path = path;
        this.topFileInfos = topFileInfos;
    }

    validateLockDependencies(deps, infos, dev, optional) {
        for (let depName in deps) {
            if (deps.hasOwnProperty(depName)) {

                let dep = deps[depName];
                if (!infos.has(depName) && (!(optional || dep.optional))) {
                    if (!dep.dev) {
                        throw new Error(`Cannot find mandatory dependency in the file system: '${depName}'`);
                    }
                }
                else {
                    let versions = infos.get(depName);
                    if (versions) {
                        let info = infos.get(depName).first()[1];
                        if (!info) {
                            throw new Error(`Cannot find an installed version of dependency: '${depName}'`);
                        }
                        info.visit(dev || dep.dev, optional || dep.optional);
                        if (dep.dependencies) {
                            this.validateLockDependencies(dep.dependencies, info.bundled, dev || dep.dev, optional || dep.optional);
                        }
                    }
                }
            }
        }
    }

    processLockFile() {
        let contents = fs.readFileSync(`${this.path}/package-lock.json`);
        let lockContents = JSON.parse(contents);
        let topDeps = lockContents.dependencies;
        this.validateLockDependencies(topDeps, this.topFileInfos, false, false);
    }
}

module.exports = LockParser;