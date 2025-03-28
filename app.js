const express = require('express');
const app = express();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

/* cors-proxy additions */
var url = require('url');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
/*
    Set header defaults with cors:
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
*/
app.use(cors());

const apiRepsonseType = Object.freeze({
  XML: "xml",
  JSON: "json"
});

// Winston handles logging; moment-timezone formats timestamps; winston-daily-rotate-file rotates logs daily
const winston = require("winston");
const moment = require('moment-timezone');
require('winston-daily-rotate-file');
// Node-schedule is used to run the queries on a schedule
const schedule = require('node-schedule');
const { error } = require('console');
const appName = require('./package.json').name;

// Set up the logger
const logger = winston.createLogger({
  level: "info",
  // Send logs to multiple outputs with timestamp in JSON format
  format: winston.format.combine(
    // Use the current time zone for the timestamp
    winston.format.timestamp({
      format: () => moment().tz(Intl.DateTimeFormat().resolvedOptions().timeZone).format()
  }),
    winston.format.json()
  ),
  // Log everything to to console and app.log, and only warnings and errors to error.log
  // Creates a valid JSON one line entry (no commas separating objects) for easy parsing line by line
  transports: [
    new winston.transports.Console({ format: winston.format.cli() }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', "error.json"),
      level: "warn",
      format: winston.format.json()
    }),
    // Rotate logs daily with the date pattern and keep 14 days of logs
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, 'logs', appName + "-%DATE%.json"),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      level: 'info',
      format: winston.format.json(),
      maxFiles: '14d'
   })
  ],
});

// Load in the config files. No checks are performed on the config file, so it is assumed to be correct
const configPath = path.join(__dirname, 'config', 'config.json');
const queryPath = path.join(__dirname, 'config', 'queries.json');
let config;
let queries;
if ((fs.existsSync(configPath)) && (fs.existsSync(queryPath))) {
  config = require(configPath);
  queries = require(queryPath).queries;
} else {
  const err = new Error("Unable to start server; missing one or more config files. Check that config.json and queries.json are present");
  logger.error(err.message);
  throw err;
}

const port = config.server.port;
// Publish the public folder
app.use(express.static(path.join(__dirname, 'public')));

// TODO: Use main config file as default, but allow individual overrides for each query
logger.info(`Creating schedule with frequency ${config.schedule.frequency}`);
// Load the configuration's frequencey (crontab format) and run all queries on that schedule
const job = schedule.scheduleJob(config.schedule.frequency, function(){
  logger.info('Running scheduled job');
  // Keep the data fresh by automatically running the queries
  runQueries(queries);
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
async function checkConnection(connectTimeout = 5000, sleepyTime = 3000, retryAttempts = 1) {
  // Base connectivity status on access to these sites with generally high uptime
  const sites = ['https://google.com', 'https://opendns.com/', 'https://azure.microsoft.com/', 'https://facebook.com/', 'https://www.wikipedia.org/'];
  // Keep retryAttempts below sites length. Note, total attempts = retryAttempts + 1
  if(retryAttempts >= sites.length) retryAttempts = sites.length - 1;
  // Declare outside of block to use as return value
  let connected = false;
  // Loop until retryAttempts are exhausted or connectivity is established
  for (let i = 0; i <= retryAttempts; i++) {
    // Fetch a site using the passed connection timeout
    connected = await fetch(sites[i], {
      method: "FET",
      cache: "no-cache",
      headers: { "Content-Type": "application/json" },
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(connectTimeout)
    }).then(() => true)
    .catch(() => false);

    logger.info(`Checking connectivity using site: ${sites[i]}, connected = ${connected}`);

    if(connected) {
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
async function runQueries(queries, timeout = 5000) {
  // Check if connected to the internet; sleep 3 s between attempts, retry up to 4 different times (5 attempts total)
  if(await checkConnection(timeout, 3000, 4)) {
    let retVal = true;
    const queryList = [];
    try {
      const curDT = new Date().toUTCString();
      await sql.connect(config.database);
      for (let i = 0; i < queries.length; i++) {
        if(queries[i].Enabled) {
          logger.info(`Executing query ${queries[i].Name}`);
          const queryResults = (await sql.query(queries[i].SQL)).recordsets[0];
          const jsonData = JSON.stringify(queryResults, null, 2);
          const filePath = queries[i].File;
          //const filePath = path.join(__dirname, `public/data/query${i}.json`);
          await fs.promises.writeFile(filePath, jsonData, 'utf8');
          logger.info(`Query results written to ${filePath} with last-modified date ${curDT}`);
          queries[i].LastModified = curDT;
          queries[i].Error = "";
          // Create a sanitized file (no SQL) for use by the client
          let obj = {
            "Name": queries[i].Name,
            "Title": queries[i].Title,
            "File": queries[i].File.replace('public/', ''),
          };
          queryList.push(obj);
        }
      }
      if (queryList.length >= 1) {
        // Write the query list to a JSON file. Sanitized list of queries that successfully ran and their file paths
        const queryListPath = path.join(__dirname, 'public', 'data', 'queryList.json');
        await fs.promises.writeFile(queryListPath, JSON.stringify(queryList, null, 2), 'utf8');
        logger.info(`Query list written to ${queryListPath}`);
      } else {
        logger.warn('No queries were executed');
      }
    } catch (err) {
      logger.error('runQueries:', err);
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
app.post('/', (req, res) => {
  res.status(200).send('POST route not implemented');
})

/* ======================================================================
  Route to handle GET requests to the root URL
  ======================================================================*/
app.get('/', (req, res) => {
  //Server up index.html by default
  res.sendFile(path.join(__dirname, '/index.html'));
})

/* ======================================================================
  Route to handle POST requests to /data
  Executes all SQL query objects and writes each result to a JSON file
  If successful, sets the last-modified header to the date and time the file was written
    ======================================================================*/
app.post('/data', (req, res) => {
  runQueries(queries).then(() => {
    const qObj = queries.find(obj => obj.LastModified !== '');
    const lMod = (qObj) ? qObj.LastModified : new Date().toUTCString();
    res.setHeader('Last-Modified', lMod);
    res.sendStatus(200);
  }).catch((err) => {
    // TODO: The Error property on the query object doesn't work; ideally this would store information on individual query results. Delete .Error?
    // Find the first query object with a non-empty error message
    const errMsg = queries.find(obj => obj.Error !== '');
    const msg = (errMsg) ? `Failed to create file ${errMsg.File} with error ${errMsg.Error}` : 'undefined error';
    logger.error(msg);
    res.status(500).send(`Internal server error in ${req.path} route: ${msg}`);
  });
})

/* ======================================================================
  Route to handle GET requests to the /data route
  ======================================================================*/
app.get('/data', (req, res) => {
  res.status(200).send('Get /data route not implemented');
})

/* ======================================================================
  Route to handle GET proxy requests where the endpoint or api being queried
  returns XML data. Because XML is meh, convert the response to JSON before
  returning. Some BisTrack WMS-specific replacements are performed for a param
  named stock_code; all other params are untouched.

  The client calling code should resemble:

  $.ajax({
          url: "/proxy-xml",
          data: {
            api: "http://<endpoint_server>>:<port>>/<endpoint>",
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
  app.get('/proxy-xml', async (req, res) => {
    // TODO: Add functionality to README
    await getDataByProxy(req, res, apiRepsonseType.XML);
});

/* ======================================================================
  Route to handle GET proxy requests where the endpoint or api being queried
  returns JSON data.

  The client calling code should resemble:

  $.ajax({
          url: "/proxy-json",
          data: {
            api: "http://<endpoint_server>>:<port>>/<endpoint>"
          },
          method: "GET",
          success: function (data) { ... });

Where api should be the base URL of the endpoint.

Listing the parameters in the "data" section negates the need to wrap param
values with a call to encodeURIComponent()
  ======================================================================*/
app.get('/proxy-json', async (req, res) => {
  await getDataByProxy(req, res, apiRepsonseType.JSON);
});

/* ======================================================================
  Begin listening on the specified port and initialize the queries
  ======================================================================*/
app.listen(port, () => {
  logger.info(`Server started on port ${port}`);
  // Create an initial set of files on startup so the application has something to work with
  const numEnabled = queries.filter(obj => obj.Enabled === true).length;
  logger.info(`Initializing ${numEnabled} query(s) on startup`);
  // Don't worry about the return value as nothing is sent to the client here
  runQueries(queries);
})

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
  ======================================================================*/
async function getDataByProxy(req, res, responseType) {
  try {
    let errorMsg;
    if (req.query.api) {
      let params = "";
      // Build the parameters back if they were split out
      for (const key in req.query) {
        if (req.query.hasOwnProperty(key) && key.toLowerCase() !== "api") {
          if (key.toLowerCase() === "stock_code") {
            // WMS requires uppercase stock codes and uses a space placeholder for underscores
            const val = req.query[key].toUpperCase().replace("_", "%20").replace("#", "%23");
            params += `&${key}=${val}`;
          } else {
            params += `&${key}=${req.query[key]}`;
          }
        }
      }
      // Check for an existing "?"; if not found, add one
      let fullURL = req.query.api + params;
      if(fullURL.indexOf("?") === -1) {
        // Switch the "&" to a "?"
        fullURL = req.query.api + "?" + params.slice(1);
      }
      // Convert the URL to an object and test validity
      const url = new URL(fullURL);
      // Origin will be null when unknown protocol is used
      if (url.origin !== 'null') {
        logger.info(`${responseType} proxy fetching api ${url.href}`);
        // CORS magic happens here; axios is not subject to single-domain policy and acts as a proxy
        const response = await axios.get(url.href);
        if(responseType === apiRepsonseType.XML) {
          // Because XML is gross, convert the returned XML to JSON
          const parser = new xml2js.Parser();
          parser.parseString(response.data, (err, result) => {
            if (err) {
              errorMsg = 'Error parsing XML ';
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
    logger.error('Proxy error:', error);
    res.status(500).json({ error: `Proxy request failed (${error.code}). Check log for details.` });
  }
}
