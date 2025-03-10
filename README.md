<a id="readme-top"></a>

# BisTrack Pi (BTPi)

<!-- ABOUT THE PROJECT -->

## About

This project provides a mechanism for displaying tabular data from a Microsoft SQL Server (MSSQL) database in a browser with a configurable data refresh rate. Specifically, the app is intended to communicate with Epicor's BisTrack software with the server running on a Raspberry Pi device, but any MSSQL database and/or device capable of running a Node.js app will suffice.

### Server (Raspberry Pi)

- The service app.js listens on a (configurable) port
  - Winston creates error and info logs and rotates daily (14 days kept)
  - On initialization, the service reads a list of (configurable) queries and runs each.
  - Each enabled query is also added to a schedule (node-schedule) and executed with the output saved as a JSON file at the scheduled interval
  - A list of successful queries (name and filepath only) is written to /public/data/queryList.json for JQuery access
  - POST to /data will run all enabled queries
- The public folder is published as the HTML root and index.html served to the user by default
- PM2 manages the server proces and automatically runs on start

### Client (Raspberry Pi)

- Default chromium-browser is used to launch index.html in kiosk mode
- index.html utilizes a meta refresh to automatically use the latest data
- Edit index.html and use JQuery to select a query and load the results in a table

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [![Next][Next.js]][Next-url]
- [![Bootstrap][Bootstrap.com]][Bootstrap-url]
- [![JQuery][JQuery.com]][JQuery-url]
- [![Javascript][Javascript]][Javascript-url]
- [![PM2][pm2]][pm2-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

This is an example of how you may give instructions on setting up your project locally.
To get a local copy up and running follow these simple example steps.

### Prerequisites

This is an example of how to list things you need to use the software and how to install them.

- npm
  ```sh
  npm install npm@latest -g
  ```

<!-- MARKDOWN LINKS & IMAGES -->

[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[Bootstrap.com]: https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white
[Bootstrap-url]: https://getbootstrap.com
[JQuery.com]: https://img.shields.io/badge/jQuery-0769AD?style=for-the-badge&logo=jquery&logoColor=white
[JQuery-url]: https://jquery.com
[Javascript]: https://img.shields.io/badge/javascript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[Javascript-url]: https://www.javascript.com/
[pm2]: https://img.shields.io/badge/pm2-2B037A?style=for-the-badge&logo=pm2&logoColor=white
[pm2-url]: https://pm2.keymetrics.io/
