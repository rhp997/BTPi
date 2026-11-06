# WMS Product Map

A yard map of where each stock class's packs and bundles are. Pick a stock class
(A = highest turns … U = lowest) and every bay with packs of that class gets a
badge with the pack count.

## Pieces

| Piece | Where | What |
|---|---|---|
| Data job | `lib/productMap.js`, scheduled in `app.js` | Weekly: one BisTrack query (in-stock products at branch 1 + stock class, not major code HA, as `btpi_app`), then one WMS `InventoryBySCE` call per product. Writes `prods.js`. |
| Hand-off | `/share/ftp/prods.js` on IronHide | The FTP server opens early on the scheduled day; a SQL Server job fetches the file for the dashboard. |
| Dashboard | `productmap/` (this folder) | `index.html` opened from the file system (`file://`, no web server), so data is loaded with `<script>` tags, not `fetch`. `data/yard.js` is the yard outline and bay coordinates; `scripts/IMap.js` draws on a canvas. |

The data job replaced `getProducts.py` in the `Python` container on IronHide
(2026-11).

## prods.js

```js
let Products =
{
    "Info": { "datetimemodified": "11/03/2026 01:10:02", "format": 2, "products": 712, "failed": 1 },
    "A": { "HF-HFSB-2X10X10": { "locations": { "03A09": 1, "10B02": 4 } }, ... },
    ...
};
```

- **Format 2** (this job): `locations` maps location → packs there.
  `datetimemodified` is Mountain time.
- **Format 1** (`getProducts.py`): `locations` listed a location once per pack,
  and the time was UTC. `IMap.js` reads both, so the dashboard can be updated
  before or after the job.
- A product whose WMS lookup fails is listed with no locations, and counted in
  `Info.failed`. If more than 20% fail, or SQL returns nothing, the job keeps
  the previous file. The file is written to a temp name and renamed, so the
  SQL Server job never picks up half a file.
- Known WMS limitation: a stock code containing `&`
  (`OSBWA-34W-.75X48X08-T&G`) fails inside WMS even when encoded.

## Config

`productmap` in `config.json` or the environment (`PRODUCTMAP__ENABLED`,
`PRODUCTMAP__INTERVAL`, `PRODUCTMAP__OUTPUT`):

| Key | Default | |
|---|---|---|
| `enabled` | `false` | |
| `interval` | `10 1 * * 2` | cron, container time (America/Denver): Tuesdays 01:10 |
| `output` | `/srv/ftp/prods.js` | IronHide mounts `/share/ftp` there |

The WMS host is `wms_proxy.host_xmlep`.

## Run once by hand

```bash
docker exec btpi node lib/productMap.js --out /tmp/prods.js --pause 100
```

Exit code 0 when the file was written. `--pause` spaces out the WMS calls.

## Dashboard deploy

Copy `index.html`, `scripts/IMap.js` and `data/yard.js` to the dashboard's
folder. `data/prods.js` comes from the SQL Server job, not from here.
