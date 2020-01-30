'use strict';

const DependencyInfo = require('./dependency-info');

const fs = require('fs');
const {TreeSet, TreeMap} = require('jstreemap');
const ConfigHelper = require("./config-helper");

class FsInspector {

    // Processing for when we have a standard package.json

    /**
     * Scans what is known about a package to determine who the author of the package is.
     * The order of precidence for authorship is as follows:
     *      1) Author defined in the package.json file
     *      2) Contributors as defined in the package.json file. 
     *          NOTE: In instances where there are more than three contributors, only the first three are listed.
     *      3) If the package is hosted on Github, the username of the host will be used
     *      4) Authorship is assigned to the username of the account on npm that manages the package.
     *      
     * 
     * @param {object} descriptor The package descriptor object. Everything one would hope to know about a package.
     * 
     * @returns The author of the project, as determined by the rules above.
     */
    static getPackageAuthors(descriptor) {
        const nameMapper = (author) => {
            if (author && author.name) {
                return author.name;
            }
            return author;
        }

        if (descriptor.author) {
            return nameMapper(descriptor.author);
        }
        else if (descriptor.contributors) {
            // Somewhat arbitrary, I guess
            let contributors;
            
            if (descriptor.contributors.length > 3) {
                contributors = descriptor.contributors.slice(0, 3).map(nameMapper);
            }
            else {
                contributors = descriptor.contributors.map(nameMapper);
            }

            return contributors.join(", ")
        }
        // Parse Github if nothing else
        else if ((descriptor.homepage && descriptor.homepage.includes("github"))) {
            return descriptor.homepage.split('/')[3];
        }
        else if ( descriptor.repository && descriptor.repository.url && 
            (typeof descriptor.repository.url === 'string') && descriptor.repository.url.includes("github")) {
            return descriptor.repository.url.split('/')[3];
        }
        else if ( descriptor.repository && 
            (typeof descriptor.repository === 'string') && descriptor.repository.includes("github")) {
            return descriptor.repository.split('/')[3];
        }
        else if (descriptor["_resolved"]) {
            // We really do not know how to handle it for the time being
            return descriptor["_resolved"].split('/')[3];
        }
        else {
            return '';
        } 
    }
    
    /**
     * Processes the information of a single module on our crawl through the file system.
     * 
     * @param {string} parentName Name of the project/sub-project being analysed
     * @param {string} moduleName Name of the module being analysed.
     * @param {string} modulePath Path to the module being analysed
     * @param {array} ignoreFiles List of modules to ignore for a particular project
     * @param {TreeMap} map The TreeMap where we store information related to a module.
     */
    static processModule(parentName, moduleName, modulePath, ignoreFiles, map) {
        let packagePath = `${modulePath}/package.json`;
        let info = new DependencyInfo();

        // If the file does not exist, we must check to see if it's a module 
        // we are explicily
        if (!fs.existsSync(packagePath)) {
            let key = `${parentName}/${moduleName}`;       
            
            // Check if the key is in the ignored modules for the project
            if(ignoreFiles.has(key)) {
                return;
            }
            else {
                throw new Error(`Missing info for '${moduleName}' path: '${modulePath}' in ${parentName} project`)
            }
        }

        // Implicit Else: Gather Module Information

        let contents = fs.readFileSync(packagePath);
        let descriptor = JSON.parse(contents);
        let proj = descriptor.name;
        let version = descriptor.version;
        let license = descriptor.license || '';
        
        if (license && license.type) {
            license = license.type;
        }

        if (!license && descriptor.licenses && Array.isArray(descriptor.licenses)) {
            license = descriptor.licenses.map(lic => {
                if (typeof lic === 'string') {
                    return lic;
                }
                if (typeof lic.type === 'string') {
                    return lic.type.replace(', ', ' ').replace(',', ' ');
                }
                return '';
            }).join(',');
        }
        
        let description = descriptor.description || '';
        let homepage = descriptor.homepage || '';
        let authorName = this.getPackageAuthors(descriptor);
        let repository = (descriptor.repository && descriptor.repository.url ? descriptor.repository.url : undefined) ||
                         (descriptor.repository ? descriptor.repository : undefined) || '';
        let downloadUrl = homepage || repository || '';
        
        info.name = proj;
        info.version = version;
        info.description = description;
        info.license = license;
        info.homepage = homepage;
        info.repository = repository;
        info.downloadUrl = downloadUrl;
        info.authorName = authorName;
        info.modulePath = modulePath;
        
        info.nameVersion = `${proj}/${version}`;

        if (!info.name) {
            throw new Error(`Information was not collected for module '${moduleName}' at ${modulePath}`)
        }

        DependencyInfo.addInfo(map, info);
        let subModulesPath = `${modulePath}/node_modules`;

        // Keep crawling into the software used by this piece of software if we can.
        if (fs.existsSync(subModulesPath)) {
            FsInspector.processDirectory(info.name, subModulesPath, ignoreFiles, info.bundled);
        }
    }

    /**
     * On crawling the file system, this will process the an entire directory before dispatching functions 
     * which will later process the individual files within a directory
     * @param {string} parentName Name of the project/sub-project being analysed
     * @param {string} modulesDir The directory we are currently analysing
     * @param {array} ignoreFiles List of modules to ignore for a particular project
     * @param {TreeMap} map A tree map we build containing each of the module's information.
     */
    static processDirectory(parentName, modulesDir, ignoreFiles, map) {
        let files = fs.readdirSync(modulesDir);
        let ignoreDirectories = ConfigHelper.getIgnoreDirectories();

        for (let fname of files) {
            if (!ignoreDirectories.has(fname)) {
                if (!fname.startsWith('@')) {
                    let modulePath = `${modulesDir}/${fname}`;
                    let fdata = fs.statSync(modulePath);
                    if (fdata.isDirectory()) {
                        FsInspector.processModule(parentName, fname, modulePath, ignoreFiles, map);
                    }
                }
                else {
                    let modulePath = `${modulesDir}/${fname}`;
                    FsInspector.processDirectory(parentName, modulePath, ignoreFiles, map);
                }
            }
        }
    }

    // Processing for when the user defines their own file containing dependency information

    /**
     * Processes an individual module in the event it is within a project were we have 
     * user defined dependency information.
     * 
     * After processing the module, the dependencies of the module used will be further be explored.
     * 
     * @param {string} parentName Name of the parent module
     * @param {string} moduleName The current module we are gathering information for. 
     * @param {string} modulePath Location of the module in the file system (relative path) 
     * @param {Array} ignoreFiles A list of files to not explore 
     * @param {TreeMap} map Where we collect all of our information. 
     * @param {TreeMap} userDefinedPackage A user defined pakage.json like file.
     */
    static processUserDefinedModule(parentName, moduleName, modulePath, ignoreFiles, map, userDefinedPackage) {
        // Some modules in a user defined package will still have their own information, let us collect this info...
        if (fs.existsSync(`${modulePath}/package.json`)) {
            this.processModule(parentName, moduleName, modulePath, ignoreFiles, map);
            return;
        }
        // Implicit else
        
        let info = new DependencyInfo();
        
        let fullModuleName = `${parentName}/${moduleName}`;  // Getting the full name of the module
        // If we're to ignore the file, return
        if (ignoreFiles.has(fullModuleName)) {
            return;
        }

        // If the module has been defined by the user, get info
        if (userDefinedPackage.has(moduleName)) {
            let userDefinedModule = userDefinedPackage.get(moduleName);
            for(let key in userDefinedModule) {
                info[key] = userDefinedModule[key];
            }

            // Check if we read the name at bare minimum
            if (!info.name) {
                throw new Error(`Information was not collected for module '${moduleName}' at ${modulePath}`);
            }
        }
        else {
            // Otherwise throw an error!
            throw new Error(`Missing info for '${moduleName}' path: '${modulePath}' in ${parentName} project`);
        }

        DependencyInfo.addInfo(map, info);  // Add the information to the map

        // Sub modules are assumed to not have user defined package info defined
        let subModulesPath = `${modulePath}/node_modules`;

        // If there is more to, explore, EXPLORE!
        if (fs.existsSync(subModulesPath)) {
            FsInspector.processDirectory(info.name, subModulesPath, ignoreFiles, info.bundled);
        }
    }

    /**
     * On crawling the file system, this will process the an entire directory before dispatching functions 
     * which will later process the individual files within a directory
     * @param {string} parentName Name of the project/sub-project being analysed
     * @param {string} modulesDir The directory we are currently analysing
     * @param {array} ignoreFiles List of modules to ignore for a particular project
     * @param {TreeMap} map A tree map we build containing each of the module's information.
     * @param {TreeMap} userDefinedPackage The user's self defined package information.
     */
    static processUserDefinedDirectory(parentName, modulesDir, ignoreFiles, map, userDefinedPackage) {
        let files = fs.readdirSync(modulesDir);
        let ignoreDirectories = ConfigHelper.getIgnoreDirectories();


        for (let fname of files) {
            if (!ignoreDirectories.has(fname)) {
                if (!fname.startsWith('@')) {
                    let modulePath = `${modulesDir}/${fname}`;
                    let fdata = fs.statSync(modulePath);
                    if (fdata.isDirectory()) {
                        FsInspector.processUserDefinedModule(parentName, fname, modulePath, ignoreFiles, map, userDefinedPackage)
                    }
                }
                else {
                    let modulePath = `${modulesDir}/${fname}`;
                    FsInspector.processUserDefinedDirectory(parentName, modulePath, ignoreFiles, map, userDefinedPackage);
                }
            }
        }
    }

    /**
     * Processes modules defined in a user-supplied package.json where we don't wish to do any crawling of the 
     * file system. This will be called when a project has the "includesNonJSModules" flag is set to true.  
     * 
     * @param {string} parentName Name of the project being analysed
     * @param {array} ignoreFiles List of modules to ignore for a particular project
     * @param {TreeMap} map A tree map we build containing each of the module's information.
     * @param {TreeMap} userDefinedPackage The user's self defined package information.
     */
    static processNonJSModules(projectName, ignoreFiles, map, userDefinedPackage) {
        let collectedInfo;
        for (let [dependency, rawInfo] of userDefinedPackage) {
            let fullDependencyName = `${projectName}/${dependency}`;

            if (!ignoreFiles.has(fullDependencyName)) {
                collectedInfo = new DependencyInfo();

                // Grab each bit of information on a project
                for (let key in rawInfo) {
                    collectedInfo[key] = rawInfo[key];
                }

                collectedInfo.nameVersion = `${collectedInfo.name}/${collectedInfo.version}`;
    
                // Check if we read the name at bare minimum
                if (!collectedInfo.name) {
                    throw new Error(`Information was not collected for module '${dependency}' at ${modulePath}`);
                }

                DependencyInfo.addInfo(map, collectedInfo);  // Add the information to the map
            }
        }
    }




    
}

module.exports = FsInspector;