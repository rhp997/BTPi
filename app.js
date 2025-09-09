const express = require("express");
const app = express();
const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const nconf = require("nconf");

/* cors-proxy additions */
var url = require("url");
const cors = require("cors");
const axios = require("axios");
const xml2js = require("xml2js");
/*
    Set header defaults with cors:
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
*/
app.use(cors());

// For distinguishing which type of API response is expected for proxy routes
const apiRepsonseType = Object.freeze({
  XML: "xml",
  JSON: "json",
});

// Defaults
const defDBTimeout = 5000; // Database connection timeout in milliseconds
const defInternetTimeout = 5000; // Check internet connectivity timeout in milliseconds
const defPort = 3000; // Port to listen on
const defInterval = "*/30 8-17 * * 1-5"; // Every 30 minutes between 8 AM and 5 PM, Monday through Friday
const defJSONSpaces = 0; // Set to a non-zero number to prettify returned JSON

// Winston handles logging; moment-timezone formats timestamps; +winston-daily-rotate-file rotates logs daily
const winston = require("winston");
const moment = require("moment-timezone");
require("winston-daily-rotate-file");

// Node-schedule is used to run the queries on a schedule
const schedule = require("node-schedule");
const { error } = require("console");
const appName = require("./package.json").name;

// Set up the logger
const logger = winston.createLogger({
  level: "info",
  // Send logs to multiple outputs with timestamp in JSON format
  format: winston.format.combine(
    // Use the current time zone for the timestamp
    winston.format.timestamp({
      format: () =>
        moment().tz(Intl.DateTimeFormat().resolvedOptions().timeZone).format(),
    }),
    winston.format.json()
  ),
  // Log everything to to console and <appName>-YYYY-MM-DD.json, and only warnings and errors to error.json
  // Creates a valid JSON one line entry (no commas separating objects) for easy parsing line by line
  transports: [
    new winston.transports.Console({ format: winston.format.cli() }),
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "error.json"),
      level: "warn",
      format: winston.format.json(),
    }),
    // Rotate logs daily with the date pattern and keep 14 days of logs
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, "logs", appName + "-%DATE%.json"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      level: "info",
      format: winston.format.json(),
      maxFiles: "14d",
    }),
  ],
});

/*
  Load the config files if present
  Read argv, environment variables, and the config files in order; the first to have a value is used
  If the config files are missing, no errors are raised. However, if the necessary keys are not passed
  in another way (env, argv), an error is thrown. Also, nconf is the bee's knees.
*/
nconf
  .argv()
  .env({
    // Separate nested environment variables with a double underscore; e.g., BTPI__PORT=3000
    separator: "__",
    // ENV variables that are UPPERCASE are converted to lowercase here
    lowerCase: true,
    parseValues: true,
    match: /^BTPI|^DATABASE|^WMS_PROXY/i,
  })
  .file("config", { file: path.join(__dirname, "config", "config.json") })
  .file("queries", { file: path.join(__dirname, "config", "queries.json") })
  .defaults({
    btpi: {
      port: defPort,
      interval: defInterval,
      connectionTimeout: defInternetTimeout,
      JSONSpaces: defJSONSpaces,
    },
    // Add defaults for the required components; this allows container builds to succeed
    // even though the defaults won't work in production
    database: {
      user: "dbuser",
      server: "dbserver",
      password: "dbpass",
      database: "db",
      connectionTimeout: defDBTimeout,
      options: {
        encrypt: false,
      },
    },
    queries: [],
  })
  .required([
    "btpi",
    "database",
    "database:user",
    "database:server",
    "database:password",
    "database:database",
    "queries",
  ]);

// Create a local config object for easy reference
const config = {
  btpi: nconf.get("btpi"),
  database: nconf.get("database"),
  wms_proxy: nconf.get("wms_proxy"),
  queries: nconf.get("queries"),
};

// Publish the public folder
app.use(express.static(path.join(__dirname, "public")));
// Set JSON spacing
app.set("json spaces", config.btpi.JSONSpaces);

// TODO: Use main config file as default, but allow individual overrides for each query
logger.info(`Creating schedule with frequency ${config.btpi.interval}`);
// Load the configuration's frequencey (crontab format) and run all queries on that schedule
const job = schedule.scheduleJob(config.btpi.interval, function () {
  logger.info("Running scheduled job");
  // Keep the data fresh by automatically running the queries
  runQueries(config.queries);
});

/* -----------------------------------------------------------------
  Sync function to "sleep" for the passed time in milliseconds
    @param {Integer} sleepyTime - Amount of time to sleep (in ms)
 ----------------------------------------------------------------- */
function sleep(sleepyTime) {
  return new Promise((resolve) => {
    setTimeout(resolve, sleepyTime);
  });
}

/* -----------------------------------------------------------------
  Async function to check internet connectivity based on the ability
  to resolve a series of popular (high uptime) websites using fetch.
    @param {Integer} connectTimeout - Connection timeout in milliseconds
    @param {Integer} sleepyTime - Amount of time to sleep (in ms) between retries
    @param {Integer} retryAttempts - Number of retry attempts
    @returns {Promise<boolean>} - A promise that resolves to true if connectivity is established or false otherwise
 ----------------------------------------------------------------- */
async function checkConnection(
  connectTimeout = config.btpi.connectionTimeout,
  sleepyTime = 3000,
  retryAttempts = 1
) {
  // Base connectivity status on access to these sites with generally high uptime
  const sites = [
    "https://google.com",
    "https://opendns.com/",
    "https://azure.microsoft.com/",
    "https://facebook.com/",
    "https://www.wikipedia.org/",
  ];
  // Keep retryAttempts below sites length. Note, total attempts = retryAttempts + 1
  if (retryAttempts >= sites.length) retryAttempts = sites.length - 1;
  // Declare outside of block to use as return value
  let connected = false;
  // Loop until retryAttempts are exhausted or connectivity is established
  for (let i = 0; i <= retryAttempts; i++) {
    // Fetch a site using the passed connection timeout
    connected = await fetch(sites[i], {
      method: "GET",
      cache: "no-cache",
      headers: { "Content-Type": "application/json" },
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(connectTimeout),
    })
      .then(() => true)
      .catch(() => false);

    logger.info(
      `Checking connectivity using site: ${sites[i]}, connected = ${connected}`
    );

    if (connected) {
      // Connected; break and return
      break;
    } else {
      // Warn and retry
      logger.warn(`Unable to access ${sites[i]}, sleeping for ${sleepyTime}`);
      await sleep(sleepyTime);
    }
  }
  // Handle connectivity concerns outside of the function
  return connected;
}

/* -----------------------------------------------------------------
  Async function to loop through an array of query objects, execute the
  SQL query, write the results to a JSON file, and update the
  LastModified and Error properties of the query object
  @param {Array<object>} queries - An array of query objects
  @returns {Promise<boolean>} - A promise that resolves to true if all
  queries are successful, or false if any query fails
 ----------------------------------------------------------------- */
async function runQueries(
  queries,
  timeout = config.database.connectionTimeout,
  addToList = true
) {
  if (queries.length < 1) {
    logger.warn("No queries to run. Please check the configuration.");
    return false;
  }
  // Check if connected to the internet; sleep 3 s between attempts, retry up to 4 different times (5 attempts total)
  if (await checkConnection(timeout, config.btpi.connectionTimeout, 4)) {
    let retVal = true;
    const queryList = [];
    try {
      const curDT = new Date().toUTCString();
      // The "database" config option should be a valid mssql Config Object
      await sql.connect(nconf.get("database"));
      logger.info(
        `Connected to database ${nconf.get(
          "database:database"
        )} on server ${nconf.get("database:server")}`
      );
      for (let i = 0; i < queries.length; i++) {
        if (queries[i].Enabled) {
          logger.info(`Executing query ${queries[i].Name}`);
          const rs = await sql.query(queries[i].SQL);
          if (rs && rs.recordsets.length > 0 && rs.recordsets[0].length > 0) {
            const queryResults = rs.recordsets[0][0];
            // Account for SQL that returns a JSON value as a string (e.g., FOR JSON AUTO)
            let jsonStr;
            // Check the first property of the returned result; if the property value is a string and the string starts with an array opening bracket, treat differently
            const firstProp = Object.keys(queryResults)[0];
            if (
              typeof queryResults[firstProp] === "string" &&
              queryResults[firstProp][0] === "["
            ) {
              // In case the property value is a wonky feller, wrap the parse() in a try
              try {
                // Hope the value of the first property is a valid JSON array; parse and stringify
                jsonStr = JSON.stringify(
                  JSON.parse(queryResults[firstProp]),
                  null,
                  config.btpi.JSONSpaces
                );
              } catch (error) {
                logger.error(
                  `Invalid JSON data for ${firstProp} (${queryResults[firstProp]}): ${error}`
                );
              }
            } else {
              // Otherwise, stringify the query results
              jsonStr = JSON.stringify(
                queryResults,
                null,
                config.btpi.JSONSpaces
              );
            }

            // Attempt to create the JSON file with the query results
            const filePath = queries[i].File;
            // If the query doesn't create a file (e.g. a maintenance SPROC), allow the File property to be empty
            if (filePath && filePath.length > 0) {
              //const filePath = path.join(__dirname, `public/data/query${i}.json`);
              await fs.promises.writeFile(filePath, jsonStr, "utf8");
              logger.info(
                `Query results written to ${filePath} with last-modified date ${curDT}`
              );
              // Create a sanitized list of successfully completed query names, titles, and their paths; for use by client
              let obj = {
                Name: queries[i].Name,
                Title: queries[i].Title,
                File: queries[i].File.replace("public/", ""),
              };
              queryList.push(obj);
            }
            queries[i].LastModified = curDT;
            queries[i].Error = "";
          } else {
            logger.warn(`Query ${queries[i].Name} returned no results.`);
          }
        } else {
          logger.info(`Query ${queries[i].Name} is not enabled; skipping.`);
        }
      }
      if (queryList.length >= 1 && addToList) {
        // Write the query list to a JSON file. Sanitized list of queries that successfully ran and their file paths
        const queryListPath = path.join(
          __dirname,
          "public",
          "data",
          "queryList.json"
        );
        await fs.promises.writeFile(
          queryListPath,
          JSON.stringify(queryList, null, defJSONSpaces),
          "utf8"
        );
        logger.info(`Query list written to ${queryListPath}`);
      }
    } catch (err) {
      logger.error("runQueries:", err);
      retVal = false;
    } finally {
      sql.close();
    }
    return retVal;
  } else {
    // Don't throw an error or otherwise exit here as connectivity may return
    logger.error("No internet connection.");
    return false;
  }
}

/* ======================================================================
  Route to handle POST requests to the root URL
  ======================================================================*/
app.post("/", (req, res) => {
  res.status(200).send("POST route not implemented");
});

/* ======================================================================
  Route to handle GET requests to the root URL
  ======================================================================*/
app.get("/", (req, res) => {
  //Serve up index.html by default
  res.sendFile(path.join(__dirname, "/index.html"));
});

/* ======================================================================
  Route to handle POST requests to /data
  Executes all SQL query objects and writes each result to a JSON file
  If successful, sets the last-modified header to the date and time the file was written
    ======================================================================*/
app.post("/data", (req, res) => {
  runQueries(queries)
    .then(() => {
      const qObj = queries.find((obj) => obj.LastModified !== "");
      const lMod = qObj ? qObj.LastModified : new Date().toUTCString();
      res.setHeader("Last-Modified", lMod);
      res.sendStatus(200);
    })
    .catch((err) => {
      // TODO: The Error property on the query object doesn't work; ideally this would store information on individual query results. Delete .Error?
      // Find the first query object with a non-empty error message
      const errMsg = queries.find((obj) => obj.Error !== "");
      const msg = errMsg
        ? `Failed to create file ${errMsg.File} with error ${errMsg.Error}`
        : "undefined error";
      logger.error(msg);
      res
        .status(500)
        .send(`Internal server error in ${req.path} route: ${msg}`);
    });
});

/* ======================================================================
  Route to handle GET requests to the /data route
  Client code should resemble:

  url: "/data",
  data: {
    Name: "LastApproved",
  },
  cache: false,
  dataType: "json",
  contentType: "application/json; charset=utf-8",
  method: "GET"

  Returns JSON
  ======================================================================*/
app.get("/data", (req, res) => {
  // Allow the client to request a specific query by name. Allow the "Name" parameter to be case insensitive.
  // Note: The query name must exactly match (case sensitive) the "Name" property in the queries array.
  let queryName = req.query.name || req.query.Name;
  logger.info(`Received request for query: ${queryName}`);
  if (queryName) {
    // Check if the query name exists in the queries array
    const queryObj = config.queries.find((obj) => obj.Name === queryName);
    if (queryObj) {
      const q = [queryObj];
      runQueries(q, config.database.connectionTimeout, false)
        .then(() => {
          // If query ran, set the last modified header and send the file that was created
          const lMod = q[0] ? q[0].LastModified : new Date().toUTCString();
          res
            .header({
              "Last-Modified": lMod,
              "Content-Type": "application/json",
            })
            .sendFile(path.join(__dirname, q[0].File));
        })
        .catch((err) => {
          logger.error(err);
          res
            .status(500)
            .json(
              `Internal server error in the ${req.path} route: ${err.message}`
            );
        });
    } else {
      logger.warn(`Query "${queryName}" not found`);
      res.status(500).json({
        message: `Query '${queryName}' not found`,
      });
    }
  } else {
    res.status(500).send({
      message:
        "No query name specified. Please provide a query name using the Name parameter.",
    });
  }
});

/* ======================================================================
  Route to handle GET proxy requests where the endpoint or api being queried
  returns XML data. Because XML is meh, convert the response to JSON before
  returning. Some BisTrack WMS-specific replacements are performed for a param
  named stock_code; all other params are untouched.

  The client calling code should resemble:

  $.ajax({
          url: "/proxy-xml",
          data: {
            api: "http://<endpoint_host>>:<port>>/<endpoint>",
            stock_code: "MY_PROD_SKU",
          },
          method: "GET",
          success: function (data) { ... });

Where api should be the base URL of the endpoint and stock_code is an example
of a parameter used by the endpoint or api. If the api does not utilize params,
they can be removed from the calling code.

Listing the parameters in the "data" section negates the need to wrap param
values with a call to encodeURIComponent()


  ======================================================================*/
app.get("/proxy-xml", async (req, res) => {
  await getDataByProxy(req, res, apiRepsonseType.XML);
});

/* ======================================================================
  Route to handle GET proxy requests where the endpoint or api being queried
  returns JSON data.

  The client calling code should resemble:

  $.ajax({
          url: "/proxy-json",
          data: {
            api: "http://<endpoint_host>>:<port>>/<endpoint>"
          },
          method: "GET",
          success: function (data) { ... });

Where api should be the base URL of the endpoint.

Listing the parameters in the "data" section negates the need to wrap param
values with a call to encodeURIComponent()
  ======================================================================*/
app.get("/proxy-json", async (req, res) => {
  await getDataByProxy(req, res, apiRepsonseType.JSON);
});

// 404 Not Found middleware - This must be the last middleware in the stack
app.use((req, res, next) => {
  // Send the URL and a message to the 404 handler
  res.status(404).render("404.ejs", {
    url: req.originalUrl,
    message: "The page you are looking for does not exist.",
  });
});

/* ======================================================================
  Begin listening on the specified port and initialize the queries
  ======================================================================*/
app.listen(config.btpi.port, () => {
  logger.info(`Server listening at http://localhost:${config.btpi.port}`);
  // Create an initial set of files on startup so the application has something to work with
  const numEnabled = config.queries.filter(
    (obj) => obj.Enabled === true
  ).length;
  logger.info(`Initializing ${numEnabled} query(s) on startup`);
  runQueries(config.queries);
});

/* ======================================================================
  Function to handle proxy requests for endpoints retruning data in both
  XML and JSON formats. XML data is converted to JSON before being returned
  using the response object. The function uses axios to make the GET request
  to the endpoint. The function builds the URL from the query parameters,
  checks if the URL is valid, and then makes a GET request to the URL using
  axios. The response is then returned as JSON.

      @param {Object} req - The request object
      @param {Object} res - The response object
      @param {string} [responseType=apiRepsonseType] - The type of response expected (XML or JSON)

  Examples:
  http://localhost:3000/proxy-json?api=/Pulse/Query/runQuery&id=db_old_units
  http://localhost:3000/proxy-xml?api=/Dashboard/meter/TasksB
  ======================================================================*/
async function getDataByProxy(req, res, responseType) {
  try {
    let errorMsg;
    if (req.query.api) {
      // Get an absolute path for the API endpoint if it is a relative path
      req.query.api = await getAbsolutePath(req.query.api, responseType);
      let params = "";
      // Build the parameters back if they were split out
      for (const key in req.query) {
        if (req.query.hasOwnProperty(key) && key.toLowerCase() !== "api") {
          if (key.toLowerCase() === "stock_code") {
            // WMS requires uppercase stock codes and uses a space placeholder for underscores
            const val = req.query[key]
              .toUpperCase()
              .replace("_", "%20")
              .replace("#", "%23");
            params += `&${key}=${val}`;
          } else {
            params += `&${key}=${req.query[key]}`;
          }
        }
      }
      // Check for an existing "?"; if not found, add one
      let fullURL = req.query.api + params;
      if (fullURL.indexOf("?") === -1) {
        // Switch the "&" to a "?"
        fullURL = req.query.api + "?" + params.slice(1);
      }
      // Convert the URL to an object and test validity
      const url = new URL(fullURL);
      // Origin will be null when unknown protocol is used
      if (url.origin !== "null") {
        logger.info(`${responseType} proxy fetching api ${url.href}`);
        // CORS magic happens here; axios is not subject to single-domain policy and acts as a proxy
        const response = await axios.get(url.href, {
          headers: {
            // Set to avoid the "Not an ajax request" error in some APIs (like BisTrack WMS Pulse which uses Telerik/Kendo UI)
            "X-Requested-With": "XMLHttpRequest",
          },
        });
        if (responseType === apiRepsonseType.XML) {
          // Because XML is gross, convert the returned XML to JSON
          const parser = new xml2js.Parser();
          parser.parseString(response.data, (err, result) => {
            if (err) {
              errorMsg = "Error parsing XML ";
              if (err.message) errorMsg += err.message;
            } else {
              res.json(result);
            }
          });
        } else if (responseType === apiRepsonseType.JSON) {
          res.json(response.data);
        } else {
          errorMsg = `Unknown or invalid response type ${responseType}`;
        }
      } else {
        errorMsg = `Unknown or invalid URL protocol (${url.protocol})`;
      }
    }
    if (errorMsg) {
      logger.error(errorMsg);
      res.status(500).json({ error: errorMsg });
    }
  } catch (error) {
    logger.error("Proxy error:", error);
    res.status(500).json({
      error: `Proxy request failed (${error.code}). Check log for details.`,
    });
  }
}

/* ======================================================================
  Allow relative paths to be prefixed with the configured WMS Pulse or XML endpoint
  Expand as necessary to support other response types
======================================================================*/
async function getAbsolutePath(urlToCheck, responseType) {
  let url = urlToCheck;
  if (!urlToCheck.startsWith("http://") && !urlToCheck.startsWith("https://")) {
    logger.info(
      `Partial URL value passed (${urlToCheck}); attempting to prefix with configured value`
    );
    // Assume XML responseTypes should be the xmlep value, JSON response types should be the pulse value
    if (responseType === apiRepsonseType.XML) {
      config.wms_proxy.host_xmlep
        ? (url = `${config.wms_proxy.host_xmlep}${url}`)
        : logger.warn(
            `No WMS XML endpoint configured (wms_proxy.host_xmlep); unable to prefix relative path`
          );
    } else if (responseType === apiRepsonseType.JSON) {
      config.wms_proxy.host_pulse
        ? (url = `${config.wms_proxy.host_pulse}${url}`)
        : logger.warn(
            `No WMS Pulse endpoint configured (wms_proxy.host_pulse); unable to prefix relative path`
          );
    }
    logger.info(`Full url = ${url}`);
  }
  return url;
}
