'use strict';
const { Console } = require('console');
const fs = require('fs');
const parseYarnLock = require('parse-yarn-lock').default;

class LockParser {
    constructor(path, topFileInfos, legacyMode) {
        this.path = path;
        this.topFileInfos = topFileInfos;
        this.legacyMode = legacyMode
    }

    validateLockDependencies(deps, infos, dev, optional) {
        let isDev;
        let isOptional;


        for (let key of infos.keys()) {
            console.log(key);
        }
        console.log("---------")
        
        for (let depName in deps) {

            if (depName === '') {
                continue;
            }
            else if (deps.hasOwnProperty(depName)) {
                let dep = deps[depName];
                let depHandle = this.legacyMode ? depName : LockParser.parseDepHandle(depName);

                //console.log(depHandle)
                isDev = dev || dep.dev || dep.devOptional;
                isOptional = optional || dep.optional || dep.devOptional;

                if (!infos.has(depHandle) && !isOptional) {
                    if (!isDev) {
                        console.log(dep);
                        throw new Error(`Cannot find mandatory dependency in the file system: '${depHandle}'`);
                    }
                }
                else {
                    let versions = infos.get(depHandle);
                    if (versions) {
                        let info = infos.get(depHandle).first()[1];
                        if (!info && !isOptional) {
                            throw new Error(`Cannot find an installed version of dependency: '${depHandle}'`);
                        }
                        info.visit(dev || dep.dev, isOptional);
                        if (this.legacyMode) {
                            this.validateLockDependencies(dep.dependencies, info.bundled, isDev, isOptional);
                        }
                    }
                }
            }
        }
    }

    /**
     * Proceeding in a breadth-first search since second level dependencies are not fully
     * installed iff said package is already installed as a dependency at a higher level.
     * eg. A requires B, C. B requires C. C requires D. In this situation we might not be able
     * to access the dpendency info for D if we're exploring down the chain A -> B -> C -> D
     * 
     * @param {object} topLevelDeps The top level dependencies of the project. These are the modules used _directly_ 
     * in a given project.
     * @param {object} lockInfo An object representing the yarn.lock file.
     * @param {boolean} topLevelOptional Whether top level modules are to be considered optional. This is almost always false.
     * 
     * @throws {Error} An error is thrown if the dependency is mandatory and no information on an installed version can be found
     */
    validatePackageDependencies(topLevelDeps, lockInfo, topLevelInfos, topLevelDev) {
        // Get a handle on the top level dependencies we need to search
        let dependenciesToSearch = Object.keys(topLevelDeps).map(depName => {
            return {
                name: depName,
                fullName: `${depName}@${topLevelDeps[depName]}`,
                isOptional: false,
                isDev: topLevelDev,
                infosArr: [topLevelInfos],
            }
        });

        let visited = {};

        while (dependenciesToSearch.length > 0) {
            const dep = dependenciesToSearch.pop()

            const visitedKey =  `${dep.fullDepName}/${dep.isDev}/${dep.isOptional}`;
            if (visited[visitedKey]) continue;
            
            // Implicit Else: we can assume we have yet to encounter this dependnecy
            visited[visitedKey] = true;

            let versions;
            //
            if (!dep.isOptional && !dep.infosArr.some(infos => infos.has(dep.name))) {
                if (!dep.isDev) {
                    throw new Error(`Cannot find mandatory dependency in the file system: '${dep.fullName}'`);
                }
                continue;
            }
            // implicit else: The dependency is not optional and we can find it in the file system

            let info = dep.infosArr.reduce((lastInfo, infos) => {
                if (lastInfo) return lastInfo;  // We've found what we need... no reason to keep looking

                versions = infos.get(dep.name);
                return !versions ? undefined : versions.get(lockInfo[dep.fullName].version);
            }, undefined)

            if (!info) {
                throw new Error(`Cannot find an installed version of dependency: '${dep.fullName}'`);
            }

            info.visit(dep.isDev, dep.isOptional);


            const subDependencyInfoArray = info.bundled.size > 0 ? [info.bundled, ...dep.infosArr] : dep.infosArr;

            // Check if the dependency has any sub dependencies (optional or otherwise and add to the list)
            if (lockInfo[dep.fullName].dependencies) {
                let subDependencies = Object.keys(lockInfo[dep.fullName].dependencies).map(subDepName => {
                    const subDependency = lockInfo[dep.fullName].dependencies[subDepName]
                    return {
                        name: subDepName,
                        fullName: `${subDepName}@${subDependency}`,
                        isOptional: dep.isOptional,
                        isDev: dep.isDev,
                        infosArr: subDependencyInfoArray
                    }
                });

                dependenciesToSearch = [...subDependencies, ...dependenciesToSearch];
            }

            if (lockInfo[dep.fullName].devDependencies) {
                let optionalDependencies = Object.keys(lockInfo[dep.fullName].dependencies).map(opDepName => {
                    const optionalDependency = lockInfo[dep.fullName].dependencies[opDepName]
                    return {
                        name: opDepName,
                        fullName: `${opDepName}@${optionalDependency}`,
                        isOptional: true,
                        isDev: dep.isDev,
                        infosArr: subDependencyInfoArray
                    }
                });
                
                dependenciesToSearch = [...optionalDependencies, ...dependenciesToSearch];
            }


        }   // end while

    }

    processLockFile() {
        // First choice is to look for yarn.lock...
        const yarnLockPresent = fs.existsSync(`${this.path}/yarn.lock`);

        if (yarnLockPresent) {
            // Successful, but it does not have all the info required, so need to read package.json 
            // to know where to start from
            const yarnLockInfo = parseYarnLock(fs.readFileSync().toString());
            const packageInfo = JSON.parse(fs.readFileSync(`${this.path}/package.json`).toString());

            this.validatePackageDependencies(packageInfo.dependencies, yarnLockInfo.object, this.topFileInfos, false);
            this.validatePackageDependencies(packageInfo.devDependencies, yarnLockInfo.object, this.topFileInfos, true);

            /*this.validatePackageDependencies(packageInfo.dependencies, yarnLockInfo.object, {}, [ this.topFileInfos ], 
                false, false, '');
            this.validatePackageDependencies(packageInfo.devDependencies, yarnLockInfo.object, {}, [ this.topFileInfos ], 
                true, false, '');
            */
        }
        else {
            // Else we look for either a package lock or a shrinkwrap file.
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
                
                let topDeps = lockContents.packages ? lockContents.packages : lockContents.dependencies;
                this.validateLockDependencies(topDeps, this.topFileInfos, false, false);
            }
        }
    }

    /**
     * Strips off the filepaths included in the new npmv8 lock files so we just have the module name
     * @param {string} depName The dependency name. This will include the full file path
     * @returns {string} A handle that matches what's stored in the file info
     */
    static parseDepHandle(depName) {
        // Usually this will be just be the last part of the file name but some modules are like
        // @hapi/joi. This is a special case.
        console.log(depName);
        const moduleRegex = /@[\w\d\-]*\/[\w\d\-]*$/
        if (moduleRegex.test(depName)) {
            return moduleRegex.exec(depName)[0];
        }
        return depName.split('/').pop();    // Usually 
    }
}

module.exports = LockParser;