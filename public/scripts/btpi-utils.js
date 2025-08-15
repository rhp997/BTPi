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

  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, "0");
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
  } else if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    // Check for numbers such as PO numbers before checking for dates as some numbers can be converted to dates
    return value;
  } else if (/Z/.test(value) && /:/.test(value)) {
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
    .then(function (data) {
      return data;
    })
    .fail(function (jqXHR, textStatus, errorThrown) {
      const msg = `Error loading JSON file ${filePath}: ${textStatus}, ${errorThrown}`;
      console.error(msg);
      showErrorDiv($("#errMsg"), msg);
      return null;
    });
}

// DataTableID = DataTableID || ($('div[class^="Component"]')[0].id);

/* ----------------------------
  Description: Passed a data table ID and a (1-based) column index, returns a promise
  that resolves to a JSON object for the column. Allows dashboards to utilize queries
  that return JSON objects in multiple columns.
---------------------------- */
function loadJsonFromDTCol(DataTableID, colIndex) {
  return new Promise((resolve, reject) => {
    // Use jQuery to select the table cell at the specified index
    const col = $(".Table" + DataTableID + " td:nth-child(" + colIndex + ")");
    // Check if the table element exists and has content
    if (col) {
      if (col.length > 0) {
        // The replace regex was in the original, but probably not needed here?
        const colData = col[0].innerHTML
          .replace(/(?:\r\n|\r|\n)/g, "")
          .replace(/\t/g, "")
          .replaceAll(/[ ]{2,}/g, " ");
        if (colData.length > 0) {
          try {
            resolve(JSON.parse(colData));
          } catch (error) {
            reject(
              new Error(
                `Failed to parse JSON from column data: ${error.message}`
              )
            );
          }
        } else {
          reject(
            new Error(
              `Column data for Table${DataTableID}, index ${colIndex} is empty`
            )
          );
        }
      } else {
        reject(
          new Error(
            `Unable to locate DOM element Table${DataTableID}; check ID`
          )
        );
      }
    }
  });
}

/* -----------------------------------------------------------------
    Function to load JSON data from the specified path in the passed
    table object. Columns/headers are dynamically generated.
    See also loadQueryInTable
-----------------------------------------------------------------*/
function loadTable(filePath, tableObj) {
  $.getJSON(filePath, function (data) {
    let tableHTML = "";
    if (data.length > 0) {
      // Loop through the array of objects
      $.each(data, function (i, obj) {
        // First time through, create the header using the object's keys
        if (i === 0) {
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
    } else {
      // Empty dataset
      // Remove all classes beginning with "table-"
      tableObj.removeClass(function (index, className) {
        return (className.match(/(^|\s)table-\S+/g) || []).join(" ");
      });
      // Change to table-info or table-warning as needed
      tableHTML +=
        '<tbody><tr><td class="table-warning">No data returned</td></tr></tbody>';
    }
    tableObj.append(tableHTML);
  }).fail(function (xhr, textstatus, error) {
    showErrorTable(
      tableObj,
      `Error attempting to access JSON: ${filePath}. ${textstatus} : ${error}`
    );
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
  tableObj.html(
    '<tr class="table-danger"><td class="table-danger">' +
      errorMsg +
      "</td></tr>"
  );
  tableObj.removeClass("table-striped table-hover");
  tableObj.addClass("table-danger");
}

/* -----------------------------------------------------------------
    Function to load the query in the passed table object.
    The query, identified by the Name element, should be found in the queryList.json file.
-----------------------------------------------------------------*/
function loadQueryInTable(qName, tableObj) {
  // queryList.json should contain an array of objects pertaining to the enabled queries that have run and for which data is available
  const qPath = "/data/queryList.json";
  // .getJSON is called asynchronously by default
  $.getJSON(qPath, function (data) {
    // Find the query object in the array of objects using the Name property
    const qObj = data.find(
      (obj) => obj.hasOwnProperty("Name") && obj["Name"] === qName
    );
    if (qObj) {
      // Build the table using the passed filepath and table object
      loadTable(qObj.File, tableObj);
      // Set the title
      $("#pageTitle").text(qObj.Title);
    } else {
      showErrorTable(tableObj, `Query not found: ${qName}`);
    }
  }).fail(function (xhr, textstatus, error) {
    showErrorTable(
      tableObj,
      `Error attempting to access JSON: ${qPath}. ${textstatus} : ${error}`
    );
  });
}

/* -----------------------------------------------------------------
   Converts an array of JSON objects to a CSV string.
   @param {Array<Object>} objArray - The array of JSON objects.
   @returns {string} The CSV formatted string.
 -----------------------------------------------------------------*/
function convertToCSV(objArray) {
  let array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
  let str = "";
  let row = "";

  // Extract headers (keys from the first object)
  for (let index in array[0]) {
    // Quote headers that contain commas or double quotes
    row += '"' + index.replace(/"/g, '""') + '",';
  }
  row = row.slice(0, -1); // Remove trailing comma
  str += row + "\r\n"; // Add header row to CSV string

  // Iterate over each object in the array to get data rows
  for (let i = 0; i < array.length; i++) {
    let line = "";
    for (let index in array[i]) {
      if (line != "") line += ",";
      let value = array[i][index];
      // Handle null/undefined values
      if (value === null || typeof value === "undefined") {
        value = "";
      }
      // Ensure values are strings and escape double quotes
      let stringValue = String(value).replace(/"/g, '""');
      line += '"' + stringValue + '"';
    }
    str += line + "\r\n"; // Add data row to CSV string
  }
  return str;
}

/* -----------------------------------------------------------------
   Triggers the download of a CSV file.
   @param {string} filename - The desired filename for the CSV.
   @param {string} csvString - The CSV content as a string.
 -----------------------------------------------------------------*/
function exportCSV(filename, csvString) {
  // Create a Blob from the CSV string with the correct MIME type
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });

  // Create a temporary anchor element
  const link = document.createElement("a");
  if (link.download !== undefined) {
    // Feature detection for download attribute
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden"; // Hide the link
    document.body.appendChild(link);
    link.click(); // Programmatically click the link to trigger download
    document.body.removeChild(link); // Clean up
    URL.revokeObjectURL(url); // Release the object URL
  } else {
    // Fallback for browsers that don't support the download attribute
    // This might open the CSV in a new tab instead of downloading
    window.open("data:text/csv;charset=utf-8," + encodeURIComponent(csvString));
  }
}

function createFlatArray(dataIndices) {
  // Get the keys from the input object
  const keys = Object.keys(dataIndices);
  // The length of the array will be equal to the number of keys
  const arrayLength = keys.length;
  // Create a new array of the determined length and fill it with zeros
  const newArray = new Array(arrayLength).fill(0);
  return newArray;
}
