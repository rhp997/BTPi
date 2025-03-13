const express = require('express');
const app = express();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
// Winston handles logging; moment-timezone formats timestamps; winston-daily-rotate-file rotates logs daily
const winston = require("winston");
const moment = require('moment-timezone');
require('winston-daily-rotate-file');
// Node-schedule is used to run the queries on a schedule
const schedule = require('node-schedule');

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
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(__dirname, 'logs', "error.log"), level: "warn" }),
    // Rotate logs daily with the date pattern and keep 14 days of logs
    new  winston.transports.DailyRotateFile({
      filename: path.join(__dirname, 'logs', "app-%DATE%.log"),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      level: 'info',
      maxFiles: '14d'
   })
  ],
});

// Load in the config files. No checks are performed on the config file, so it is assumed to be correct
// TODO: Use nconf module for config load?
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

// Create a new schedule job to run every 30 minutes between 8:00 AM and 5:00 (5:30) PM, Monday through Friday
// This job refreshes the data every 30 minutes during business hours
logger.info(`Creating schedule with frequency ${config.schedule.frequency}`);
const job = schedule.scheduleJob(config.schedule.frequency, function(){
  logger.info('Running scheduled job');
  // Keep the data fresh by automatically running the queries
  runQueries(queries);
});

/* -----------------------------------------------------------------
  Async function to loop through an array of query objects, execute the
  SQL query, write the results to a JSON file, and update the
  LastModified and Error properties of the query object
  @param {Array<object>} queries - An array of query objects
  @returns {Promise<boolean>} - A promise that resolves to true if all
  queries are successful, or false if any query fails
 ----------------------------------------------------------------- */
async function runQueries(queries) {
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
    // TODO: Test this error handling
    // TODO: Implement POST refresh button
    // Find the first query object with a non-empty error message
    const errMsg = queries.find(obj => obj.Error !== '');
    const msg = (errMsg) ? `Failed to create file ${errMsg.File} with error ${errMsg.Error}` : 'undefined error';
    logger.error(msg);
    res.status(500).send(`Internal server error in ${req.path} route: ${msg}`);
  });
})

/* ======================================================================
  Begin listening on the specified port and initialize the queries
  ======================================================================*/
app.listen(port, () => {
  logger.info(`Server started on port ${port}`);
  // Create an initial set of files on startup so the application has something to work with
  logger.info(`Initializing up to ${queries.length} query(s) on startup`);
  // Don't worry about the return value as nothing is sent to the client here
  runQueries(queries);
})