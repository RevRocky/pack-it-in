'use strict';

const {TreeMap} = require('jstreemap');

class DependencyInfo {
    constructor() {
        this.name = '';
        this.version = '';
        this.description = '';
        this.license = '';
        this.hasApacheLicense = false;
        this.hasCrypto = false;
        this.url = '';
        this.author = '';
        this.bundled = new TreeMap();
        this.visited = false;
        this.dev = false;
        this.prod = false;
        this.optional = false;
        this.mandatory = false;
        this.timeProcessed = new Date();      
    }

    static addInfo(map, info) {
        let versions;
        if (map.has(info.name)) {
            versions = map.get(info.name);
        }
        else {
            versions = new TreeMap();
            map.set(info.name, versions);
        }
        if (!versions.has(info.version)) {
            versions.set(info.version, info);
        }
    }

    static mergeInfo(map, info) {
        let versions;
        if (map.has(info.name)) {
            versions = map.get(info.name);
        }
        else {
            versions = new TreeMap();
            map.set(info.name, versions);
        }
        if (!versions.has(info.version)) {
            versions.set(info.version, info);
        }
        else {
            let oldInfo = versions.get(info.version);
            oldInfo.dev = oldInfo.dev || info.dev;
            oldInfo.prod = oldInfo.prod || info.prod;
            oldInfo.optional = oldInfo.optional || info.optional;
            oldInfo.mandatory = oldInfo.mandatory || info.mandatory;
        }
    }

    visit(dev, optional) {
        this.visited = true;
        if (dev) {
            this.dev = true;
        }
        else {
            this.prod = true;
        }
        if (optional) {
            this.optional = true;
        }
        else {
            this.mandatory = true;
        }
    }

    /**
     * Seperates the licenses for a given project into two 
     * categories. The first is a license that can be found on 
     * the white list. The second is a list of all other licenses.
     * 
     * @param {TreeMap} whiteList Our list of preferred licenses
     */
    identifyPreferredLicense(whiteList) {
        let lics = this.license.slice(); // Copy the array...
        this.preferredLicense = '';
        this.additionalLicenses = '';
        for (let [index, lic] of lics.entries()) {
            if (whiteList.has(lic)) {
                this.preferredLicense = lic;

                 // Remove preferred licemce and join additional licenses.
                lics.splice(index, 1);
                this.additionalLicenses = lics.join(', ');

                break;      // No need to do anything else
            }
        }
        this.additionalLicenses = lics.join(', ');
    }


    static *forEach(infos) {
        for (let [name, versions] of infos) {
            for (let [version, info] of versions) {
                yield [name, version, info];
            }
        }
    }

    static *forEachRecursively(infos) {
        for (let [name, version, info] of DependencyInfo.forEach(infos)) {
            yield [name, version, info];
            if (info.bundled.size > 0) {
                yield *DependencyInfo.forEachRecursively(info.bundled);
            }
        }
    }
}

module.exports = DependencyInfo;