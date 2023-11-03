Requires a Broadcaster with some reserve amount set. TODO

### Config variables
```
  {
    CONF_MASTER_PORT: Port to upload results to
    CONF_MASTER_DOMAIN: Domain to upload results to
    CONF_MASTER_PATH: Path to the upload endpoint in case there's a reverse proxy
    CONF_FRIENDLY_NAME: Name to attach to the prober, the city name usually works
    CONF_REGION: Continent the prober is located in
    CONF_LP_REGIONS: Livepeer leaderboard regions which map to locally resolved orchestrators
    CONF_CONCURRENCY: Amount of orchestrators to test at the same time
    CONF_SLEEPTIME: Time to sleep in the main loop
    CONF_MAX_LATENCY: Max GetOrch discovery time before we set it to 0
    CONF_ROUNDTIME: Minimum amount of time between batch-checks
    CONF_ORCHINFO_TIMEOUT: Timeout between refreshing the active O list
    CONF_BROADCASTER: Public address of the broadcaster to mimic
    CONF_DNS_TIMEOUT: Timeout between DNS & GEO resolving for orchestrator instances
    CONF_PRESHARED_MASTER_KEY: password for uploading to the hodler
    CONF_SIGNATURE: Broadcaster signature over a message containing it's own public address
  }
```

Obtaining the `CONF_SIGNATURE` is unfortunately a pain in the ass. The only way for now it add a print statement to the `livepeer/server/rpc.go/genOrchestratorReq` function in `go-livepeer` and then run the Broadcaster. All web3 libraries prepend a prefix to any message they sign for security purposes, so a script which can generate the signature from the private key would be nice to have here...

### Run production
Note: this folder has to be placed in `/orchTest/client`, or edit `ecosystem.config.js` to match the new location

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CONF_MASTER_PORT = 443,
    CONF_MASTER_DOMAIN = "stronk.rocks",
    CONF_MASTER_PATH = "/orch/collectStats",
    CONF_FRIENDLY_NAME = "Michigan",
    CONF_REGION = "Europe",
    CONF_LP_REGIONS = ["FRA", "LON", "PRA"],
    CONF_CONCURRENCY = 6,
    CONF_SLEEPTIME = 2000, //< 2 seconds
    CONF_MAX_LATENCY = 2000, //< 2 seconds
    CONF_ROUNDTIME = 60000, //< 1 minute
    CONF_ORCHINFO_TIMEOUT = 14400000, //< 4 hours
    CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e",
    CONF_DNS_TIMEOUT = 600000, //< 10 minutes
    CONF_PRESHARED_MASTER_KEY = "koekjes",
    CONF_SIGNATURE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
} = process.env;

```

    pm2 start ecosystem.config.js

### Run development

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CONF_MASTER_PORT = 42069,
    CONF_MASTER_DOMAIN = "127.0.0.1",
    CONF_MASTER_PATH = "/api/master/collectStats",
    CONF_FRIENDLY_NAME = "Leiden",
    CONF_REGION = "Europe",
    CONF_LP_REGIONS = ["FRA", "LON", "PRA"],
    CONF_CONCURRENCY = 6,
    CONF_SLEEPTIME = 2000, //< 2 seconds
    CONF_MAX_LATENCY = 2000, //< 2 seconds
    CONF_ROUNDTIME = 60000, //< 1 minute
    CONF_ORCHINFO_TIMEOUT = 14400000, //< 4 hours
    CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e",
    CONF_DNS_TIMEOUT = 600000, //< 10 minutes
    CONF_PRESHARED_MASTER_KEY = "koekjes",
    CONF_SIGNATURE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
} = process.env;
```

    npm run dev

