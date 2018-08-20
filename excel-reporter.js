'use strict';

const DependencyInfo = require('./dependency-info');

const XLSX = require('xlsx');

class ExcelReporter {

    /**
     * Creates the header row of a report spreadsheet.
     * 
     * @param {array} reportFields: A list of objects detailing the fields of the report we are
     * building. 
     * 
     * @return {Array} The header row to be appended to our excel reports.
     */
    static genHeaderRow(reportFields) {
        let genHeaderRow = ["#"];   // First column is the package number, ALWAYS.
        
        // Loop through and make the header of our reprot.
        for (let field of reportFields) {
            genHeaderRow.push(field.columnTitle);
        }

        return genHeaderRow;
    }

    /**
     * Outputs information about a given dependency to a row on an excel spreadsheet.
     * @param {number} count 
     * @param {Array} reportFields Fields of the report being created
     * @param {DependencyInfo} info Info about a particular dependency
     * 
     * @returns {Array} An array with the information to be written to a row of the excel spreadsheet.
     */
    static infoToRow(count, reportFields, info) {
        let row = [count];
        
        // Loop through the fields
        for (let field of reportFields) {
            // If there's a default value for the field, regardless of row, push it.
            if (field.defaultValue) {
                row.push(field.defaultValue);
            }
            else {
                // Otherwise read it from the dependency info
                row.push(info[field.variableValue]);    // Very important that the variable value matches what is in info.
            }
        }
        return row;
    }

    /**
     * 
     * @param {TreeMap} projInfos Info pertaining to software that are runtime dependencies of the project
     * @param {TreeMap} devInfos Info pertaining to software that are dependencies of the build tools used by the project.
     * @param {Array} reportFields Config information about which fields are to be included in the user's report. 
     * @param {string} reportPath Location on the file system where the report will be written. 
     */
    static createReport(projInfos, devInfos, reportFields, reportPath) {
        let rowCount = 0;
        let data1 = [ExcelReporter.genHeaderRow(reportFields)];
        let data2 = [ExcelReporter.genHeaderRow(reportFields)];

        for (let [name, version, info] of DependencyInfo.forEach(projInfos)) {
            let row = ExcelReporter.infoToRow(++rowCount, reportFields, info);
            data1.push(row);
        }   

        rowCount = 0;
        for (let [name, version, info] of DependencyInfo.forEach(devInfos)) {
            let row = ExcelReporter.infoToRow(++rowCount, reportFields, info);
            data2.push(row);
        }

        let wb = XLSX.utils.book_new();
        let ws1 = XLSX.utils.aoa_to_sheet(data1);
        let ws2 = XLSX.utils.aoa_to_sheet(data2);

        // TODO: Generify the sheet titles... or move out to the config file.
        XLSX.utils.book_append_sheet(wb, ws1, '3rd party');
        XLSX.utils.book_append_sheet(wb, ws2, 'No IP 3rd party');
        XLSX.writeFile(wb, reportPath);
    }
}

module.exports = ExcelReporter;