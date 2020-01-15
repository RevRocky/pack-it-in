'use strict';
const fs = require('fs');
const parseYarnLock = require('parse-yarn-lock').default;

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
    
    validatePackageDependencies(deps, lockInfo, visited, infosArr, dev, optional) {
        for (const depName in deps) {
            const fullDepName = `${depName}@${deps[depName]}`;
            const visitedKey = `${fullDepName}/${dev}/${optional}`;
            if (!visited[visitedKey]) {
                // Prevent cycles
                visited[visitedKey] = true;

                if (!infosArr.some(infos => infos.has(depName)) && !optional) {
                    if (!dev) {
                        throw new Error(`Cannot find mandatory dependency in the file system: '${depName}'`);
                    }
                }
                else {
                    // Find the correct info from our stack (see below)
                    let info = infosArr.reduce((lastInfo, infos) => {
                        if (lastInfo) {
                            // already found the info, return it
                            return lastInfo;
                        }
                        // look for the dependency, then the version
                        const versions = infos.get(depName);
                        return !versions ? undefined : versions.get(lockInfo[fullDepName].version);
                    }, undefined);

                    if (!info) {
                        throw new Error(`Cannot find an installed version of dependency: '${depName}'`);
                    }

                    info.visit(dev, optional);

                    // The way yarn installs work, can't just use info.bundled, so create and pass a stack
                    infosArr = info.bundled.size > 0 ? [info.bundled].concat(infosArr) : infosArr;
                    if (lockInfo[fullDepName].optionalDependencies) {
                        this.validatePackageDependencies(lockInfo[fullDepName].optionalDependencies, lockInfo, 
                            visited, infosArr, dev, true);
                    }
                    if (lockInfo[fullDepName].dependencies) {
                        this.validatePackageDependencies(lockInfo[fullDepName].dependencies, lockInfo, 
                            visited, infosArr, dev, optional);
                    }
                }
            }
        }
    }

    processLockFile() {
        // First choice is to look for yarn.lock...
        let yarnLockInfo;
        try {
            yarnLockInfo = parseYarnLock(fs.readFileSync(`${this.path}/yarn.lock`).toString());
        }
        catch(err) {            
        }

        if (yarnLockInfo) {
            // Successful, but it does not have all the info required, so need to read package.json 
            // to know where to start from
            const packageInfo = JSON.parse(fs.readFileSync(`${this.path}/package.json`).toString());

            this.validatePackageDependencies(packageInfo.dependencies, yarnLockInfo.object, {}, [ this.topFileInfos ], 
                false, false, '');
            this.validatePackageDependencies(packageInfo.devDependencies, yarnLockInfo.object, {}, [ this.topFileInfos ], 
                true, false, '');
        }
        else {
            let contents;

            // Second choice is to read the more modern package-lock, third choice is to read
            // a shrinkwrapped file.
            try {
                contents = fs.readFileSync(`${this.path}/package-lock.json`);
            }
            catch (err) {
                contents = fs.readFileSync(`${this.path}/npm-shrinkwrap.json`);
            }
            finally {
                let lockContents = JSON.parse(contents);
                let topDeps = lockContents.dependencies;
                this.validateLockDependencies(topDeps, this.topFileInfos, false, false);
            }
        }
    }
}

module.exports = LockParser;