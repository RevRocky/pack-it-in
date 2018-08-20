'use strict';

const DependencyInfo = require('./dependency-info');

const fs = require('fs');
const {TreeSet, TreeMap} = require('jstreemap');
const ConfigHelper = require("./config-helper");

class FsInspector {

    // Processing for when we have a standard package.json

    /**
     * Processes the information of a single module on our crawl through the file system.
     * 
     * @param {string} parentName Name of the project/sub-project being analysed
     * @param {string} moduleName Name of the module being analysed.
     * @param {string} modulePath Path to the module being analysed
     * @param {array} ignoreFiles List of modules to ignore for a particular project
     * @param {*} map The TreeMap where we store information related to a module.
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
        let description = descriptor.description || '';
        let homepage = descriptor.homepage || '';
        let authorName = '';
        
        if (descriptor.author && descriptor.author.name) {
            authorName = descriptor.author.name;
        
        }
        info.name = proj;
        info.version = version;
        info.description = description;
        info.license = license;
        info.homepage = homepage;
        info.authorName = authorName;
        info.modulePath = modulePath;
        
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



    
}

module.exports = FsInspector;