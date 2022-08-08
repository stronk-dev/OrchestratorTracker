Requires a Broadcaster with some reserve amount set. TODO

### Config variables
```
  {
    CLIENT_PORT: what port the client accepts API requests on
    MASTER_PORT: what port the master should be listening on
    MASTER_DOMAIN: the domain on which the master is hosted
    MASTER_PATH: the path to the collectStats endpoint. Should be `/api/master/collectStats` unless you are running a reverse proxy
    FRIENDLY_NAME: `region` label which gets attached to collected data
    PRESHARED_MASTER_KEY: must be the same as the `PRESHARED_MASTER_KEY` on the master
    CONF_SLEEPTIME: time between testing Orchestrators in milliseconds
    CONF_ORCHINFO_TIMEOUT: timeout for refreshing the list of active orchestrators in milliseconds
    CONF_BROADCASTER: eth address of the broadcaster
    CONT_SIG = broadcasters' signature of their eth address - reach out on how to get this
  }
```
### Run production
Note: this folder has to be placed in `/orchTest/client`

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CLIENT_PORT = 42068,
    MASTER_PORT = 443,
    MASTER_DOMAIN = "nframe.nl",
    MASTER_PATH = "/orch/collectStats",
    FRIENDLY_NAME = "Chicago",
    PRESHARED_MASTER_KEY = "koekjes",
    CONF_SLEEPTIME = 2000,
    CONF_ORCHINFO_TIMEOUT = 600000,
    CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e",
    CONT_SIG = Buffer [array of uint8]

} = process.env;

```

    pm2 start ecosystem.config.js

### Run development

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CLIENT_PORT = 42068,
    MASTER_PORT = 42069,
    MASTER_DOMAIN = "127.0.0.1",
    MASTER_PATH = "/api/master/collectStats",
    FRIENDLY_NAME = "Leiden",
    PRESHARED_MASTER_KEY = "koekjes",
    CONF_SLEEPTIME = 5000,
    CONF_ORCHINFO_TIMEOUT = 100000,
    CONF_BROADCASTER = "847791cBF03be716A7fe9Dc8c9Affe17Bd49Ae5e",
    CONT_SIG = Buffer [array of uint8]
} = process.env;
```

    npm run dev

