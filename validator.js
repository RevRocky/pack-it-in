'use strict';

const {TreeSet, TreeMap} = require('jstreemap');
const DependencyInfo = require('./dependency-info');


class Validator {

    /**
     * Reviews the licenses in each of a project's dependencies and ensures that all
     * dependencies use a licences within the user's whitelist.
     * 
     * @param {TreeMap} infos Information on each piece of softare included in a project.
     * @param {object} licenseConfig Configuration information corresponding to the user's preferences
     * w.r.t. licenses.
     * 
     * @throws {Error} An error is thrown if a dependency can not be found to have a license
     * that is permitted for the project in question.
     */
    static reviewLicenses(infos, licenseConfig) {

        const rejectedLicenses = new TreeMap();

        for (let [name, version, info] of DependencyInfo.forEach(infos)) {
            let lic = info.license;
            if ((typeof lic) === 'string') {
                lic = lic.replace(/[\\(\\)\\=]/g, '');
                lic = lic.replace(/ ((((a|A)(n|N)(d|D))|((o|O)(r|R)))) /, ",");                   // Replace Or/And with a ','

                let licenses = [lic];
                
                if (lic.includes('/')) {
                    licenses = lic.split('/');
                }
                if (lic.includes(',')) {
                    licenses = lic.split(',');
                }
                info.license = licenses;
            }

            // Look at each license of a project and determine if it has at least one valid license.
            let isValid = false;
            for (let [index, l] of info.license.entries()) {
                if (licenseConfig.whiteList.has(l)) {
                    isValid = true;
                }  
                
                if (!isValid) {
                    isValid = licenseConfig.exceptions.has(`${info.name}/${l}/${info.prod}`);
                }
                
                if (licenseConfig.alternateLocations.has(`${info.name}/${l}`)) {
                    info.license = licenseConfig.alternateLocations.get(`${info.name}/${l}`);
                    isValid = true;
                }

                // We've found a valid license, stop searching.
                if (isValid) {
                    break;
                }

            }

            // TODO: Implement "Silent Mode" Opition where we do not exit when a project does not have a license and instead
            // place into a file.
            // Include the parent module for easier location of the module.
            if (!isValid) {
                rejectedLicenses.insertOrReplace(name, info.license);
                continue;           // We don't have a valid license do no more work...
            }

            info.identifyPreferredLicense(licenseConfig.whiteList);    // Identify the preferred license for a module.

            if (info.preferredLicense.includes('Apache')) {
                info.validationPlan = "None: Apache 2.0 needs distribution of NOTICE files in addition to licenses.";
            }

        } // End For-Each

        if (rejectedLicenses.size) {
            console.error("\nNo acceptable license could be found for the following dependencies:\n");

            for (const [dependency, license] of rejectedLicenses) {
                console.error(`\t${dependency} cound only be found with license(s): ${license}`);
            }

            throw new Error('Not all licenses could be validated against the white list.');
        }
    }   

    static reviewEncryption(infos, cryptographyConfig) {
        for (let [name, version, info] of DependencyInfo.forEach(infos)) {
            if (info.description.includes('crypt') || info.name.includes('crypt')) {
                if (cryptographyConfig.packageList.has(info.name)) {
                    info.hasCrypto = 'Y';
                }
                else if (cryptographyConfig.exceptions.has(info.name)) {
                    // do nothing
                }
                else {
                    throw new Error(`Suspected crypto content in package '${info.name}': '${info.description}`);
                }
            }
        }
    }
}

module.exports = Validator;