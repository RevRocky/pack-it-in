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
        let yarnLockInfo;
        try {
            yarnLockInfo = parseYarnLock(fs.readFileSync(`${this.path}/yarn.lock`).toString());
        }
        catch(err) {  
            console.log(err)          
        }

        if (yarnLockInfo) {
            // Successful, but it does not have all the info required, so need to read package.json 
            // to know where to start from
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