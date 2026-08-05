# AI Agent Guidelines for BTPi

`BTPi` is a Node.js Express web application designed for running BisTrack Business Intelligence and WMS API proxies on Raspberry Pi devices.

## 1. Project Overview & Stack
- **Stack**: Node.js (CommonJS), Express.js, Axios, `mssql` (SQL Server driver), `winston` (logging), EJS templates, XML2JS.
- **Main Entrypoint**: `app.js`
- **Use Case**: Serves BI dashboards, handles proxy requests between local displays/Raspberry Pi hardware and BisTrack/WMS SQL backends.

## 2. Repository Layout
- `app.js`: Express application initialization, server setup, and global middleware.
- `routes/`: Express route definitions for endpoints and view rendering.
- `lib/`: Business logic, SQL query handlers, and helper utilities.
- `config/`: App configuration defaults via `nconf`.
- `rpi-config/`: Raspberry Pi deployment scripts, environment setup, and systemd units.
- `WMSEndpoints.md` & `RPIConfig.md`: Documentation for WMS endpoints and Pi hardware setup.

## 3. Development Guidelines
- **Module System**: CommonJS (`require` / `module.exports`). Do not convert to ES module imports unless requested.
- **Configuration**: Always use `nconf` or environment variables for dynamic properties rather than hardcoding IP addresses or credentials.
- **SQL Queries**: Ensure proper parameterized queries when interacting with SQL Server (`mssql`) to prevent injection vulnerabilities.

## 4. Verification & Validation Commands
Before committing changes, verify syntax and server setup:
- **Syntax Check**: `node -c app.js`
- **Dependency Audit**: `npm ls --depth=0`
- **Dev Run Check**: `node app.js` (or `npm start`)
