Requires a Broadcaster with some reserve amount set. TODO

### Config variables
```
exports.CONF_MASTER_PORT: Port to upload results to
exports.CONF_MASTER_DOMAIN: Domain to upload results to
exports.CONF_MASTER_PATH: Path to the upload endpoint in case there's a reverse proxy
exports.CONF_FRIENDLY_NAME: Name to attach to the prober, the city name usually works
exports.CONF_REGION: Continent the prober is located in
exports.CONF_LP_REGIONS: Livepeer leaderboard regions which map to locally resolved orchestrators
exports.CONF_CONCURRENCY: Amount of orchestrators to test at the same time
exports.CONF_SLEEPTIME: Time to sleep in the main loop
exports.CONF_MAX_LATENCY: Max GetOrch discovery time before we set it to 0
exports.CONF_ROUNDTIME: Minimum amount of time between batch-checks
exports.CONF_ORCHINFO_TIMEOUT: Timeout between refreshing the active O list
exports.CONF_BROADCASTER: Public address of the broadcaster to mimic
exports.CONF_DNS_TIMEOUT: Timeout between DNS & GEO resolving for orchestrator instances
exports.CONF_PRESHARED_MASTER_KEY: password for uploading to the hodler
exports.CONF_SIGNATURE: Broadcaster signature over a message containing it's own public address
exports.CONF_GRAPH_URI: Full URL including API key to the Livepeer subgraph;
```

Obtaining the `CONF_SIGNATURE` is unfortunately a pain in the ass. The only way for now it add a print statement to the `livepeer/server/rpc.go/genOrchestratorReq` function in `go-livepeer` and then run the Broadcaster. All web3 libraries prepend a prefix to any message they sign for security purposes, so a script which can generate the signature from the private key would be nice to have here...

### Run production
Note: this folder has to be placed in `/orchTest/client`, or edit `ecosystem.config.js` to match the new location

    npm install
    nano src/config.js

example `config.js`:
```
exports.CONF_MASTER_PORT = 443;
exports.CONF_MASTER_DOMAIN = "stronk.rocks";
exports.CONF_MASTER_PATH = "/orch/collectStats";
exports.CONF_FRIENDLY_NAME = "Michigan";
exports.CONF_REGION = "Europe";
exports.CONF_LP_REGIONS = ["FRA", "LON", "PRA"];
exports.CONF_CONCURRENCY = 6;
exports.CONF_SLEEPTIME = 2000; //< 2 seconds
exports.CONF_MAX_LATENCY = 2000; //< 2 seconds
exports.CONF_ROUNDTIME = 60000; //< 1 minute
exports.CONF_ORCHINFO_TIMEOUT = 14400000; //< 4 hours
exports.CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e";
exports.CONF_DNS_TIMEOUT = 600000; //< 10 minutes
exports.CONF_PRESHARED_MASTER_KEY = "koekjes";
exports.CONF_SIGNATURE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
exports.CONF_GRAPH_URI = "https://gateway-arbitrum.network.thegraph.com/api/REDACTED/subgraphs/id/REDACTED";
```

    pm2 start ecosystem.config.cjs

### Run development

    npm install
    nano src/config.js

example `config.js`:
```
exports.CONF_MASTER_PORT = 42069;
exports.CONF_MASTER_DOMAIN = "127.0.0.1";
exports.CONF_MASTER_PATH = "/api/master/collectStats";
exports.CONF_FRIENDLY_NAME = "Leiden";
exports.CONF_REGION = "Europe";
exports.CONF_LP_REGIONS = ["FRA", "LON", "PRA"];
exports.CONF_CONCURRENCY = 6;
exports.CONF_SLEEPTIME = 2000; //< 2 seconds
exports.CONF_MAX_LATENCY = 2000; //< 2 seconds
exports.CONF_ROUNDTIME = 60000; //< 1 minute
exports.CONF_ORCHINFO_TIMEOUT = 14400000; //< 4 hours
exports.CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e";
exports.CONF_DNS_TIMEOUT = 600000; //< 10 minutes
exports.CONF_PRESHARED_MASTER_KEY = "koekjes";
exports.CONF_SIGNATURE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
exports.CONF_GRAPH_URI = "https://gateway-arbitrum.network.thegraph.com/api/REDACTED/subgraphs/id/REDACTED"
```

    npm run dev

