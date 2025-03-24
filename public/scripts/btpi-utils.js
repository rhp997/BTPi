/* -----------------------------------------------------------------
    Function to check if the passed string is a date (not datetime)
    and if so, format it to MM/DD/YYYY, otherwise, return the passed string.
    ----------------------------------------------------------------- */
    function ifDateFormat(dateString) {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        // Not a valid date. Return the passed string.
        return dateString;
    }

    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
}

/* -----------------------------------------------------------------
    Function to format column data. If the value is null, undefined, or "null", return an empty string.
    If the value is a date format, format it to MM/DD/YYYY.
    Otherwise, return the value as is.
-----------------------------------------------------------------*/
function formatColData(value) {
    if (value === null || value === undefined || value === "null") {
        return "";
    } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        // Check for numbers such as PO numbers before checking for dates as some numbers can be converted to dates
        return value;
    } else if ((/Z/.test(value)) && (/:/.test(value))) {
        return ifDateFormat(value);
    } else {
        return value;
    }
}

function addCaption(tableObj, captionTxt) {
    tableObj.prepend($("<caption class='h5'></caption>").text(captionTxt));
}

/* -----------------------------------------------------------------
    Function to load JSON data from the specified path and return a data object
-----------------------------------------------------------------*/
function loadJSON(filePath) {
    return $.getJSON(filePath)
    .then(function(data) { return data; })
    .fail(function(jqXHR, textStatus, errorThrown) {
        const msg = `Error loading JSON file ${filePath}: ${textStatus}, ${errorThrown}`;
        console.error(msg);
        showErrorDiv($("#errMsg"), msg);
        return null;
    });
}

/* -----------------------------------------------------------------
    Function to load JSON data from the specified path in the passed
    table object. Columns/headers are dynamically generated.
    See also loadQueryInTable
-----------------------------------------------------------------*/
function loadTable(filePath, tableObj) {
    $.getJSON(filePath,
        function (data) {
            let tableHTML = "";
            // Loop through the array of objects
            $.each(data, function (i, obj) {
                // First time through, create the header using the object's keys
                if(i === 0) {
                    tableHTML += '<thead class="table-primary text-white"><tr>';
                    // Loop through each key in the object
                    $.each(obj, function (key, value) {
                        tableHTML += "<th>" + key + "</th>";
                    });
                    tableHTML += "</tr></thead><tbody>";
                }
                tableHTML += "<tr>";
                $.each(obj, function (key, value) {
                    tableHTML += "<td>" + formatColData(value) + "</td>";
                });
                tableHTML += "</tr>";
            });
            tableHTML += "</tbody>";
            tableObj.append(tableHTML);
    }).fail(function(xhr, textstatus, error) {
        showErrorTable(tableObj, `Error attempting to access JSON: ${filePath}. ${textstatus} : ${error}`);
    });
}

/* -----------------------------------------------------------------
    Function to display errors in the passed DIV object
-----------------------------------------------------------------*/
function showErrorDiv(divObj, errorMsg) {
    divObj.text(errorMsg);
    divObj.removeClass("d-none");
    divObj.addClass("alert alert-danger d-block");
}

/* -----------------------------------------------------------------
    Function to display errors as a single row in the passed table object.
-----------------------------------------------------------------*/
function showErrorTable(tableObj, errorMsg) {
    console.log(errorMsg);
    tableObj.html('<tr class="table-danger"><td class="table-danger">' + errorMsg + "</td></tr>");
    tableObj.removeClass("table-striped table-hover");
    tableObj.addClass("table-danger");
}

/* -----------------------------------------------------------------
    Function to load the query in the passed table object.
    The query, identified by the Name element, should be found in the queryList.json file.
-----------------------------------------------------------------*/
function loadQueryInTable(qName, tableObj) {
    // queryList.json should contain an array of objects pertaining to the enabled queries that have run and for which data is available
    const qPath = '/data/queryList.json';
    // .getJSON is called asynchronously by default
    $.getJSON(qPath,
        function (data) {
            // Find the query object in the array of objects using the Name property
            const qObj = data.find(obj => obj.hasOwnProperty("Name") && obj["Name"] === qName);
            if(qObj) {
            // Build the table using the passed filepath and table object
            loadTable(qObj.File, tableObj);
            // Set the title
            $("#pageTitle").text(qObj.Title);
            }
            else { showErrorTable(tableObj, `Query not found: ${qName}`); }
    }).fail(function(xhr, textstatus, error) {
        showErrorTable(tableObj, `Error attempting to access JSON: ${qPath}. ${textstatus} : ${error}`);
    });
}