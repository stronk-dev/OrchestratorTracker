
### Config variables
```
  {
    CONF_API_L1_HTTP: HTTP Uri to L1 RPC provider
    CONF_API_L1_KEY: and it's api key,
    CONF_TIMEOUT_ENS_DOMAIN: timeout before refreshing an orchs ENS domain name
    CONF_KEY_EXPIRY: timeout before clearing certain orch instance data
    CONF_MASTER_PORT: port to accept uploads on from probers
    CONF_PRESHARED_MASTER_KEY: password for uploading
    CONF_SCORE_TIMEOUT: timeout for checking if some new test stream results came in
    CONF_SLEEPTIME: Time to sleep in the main loop
  }
```
### Run production
Note: this folder has to be placed in `/orchTest/master`

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CONF_API_L1_HTTP = "https://eth-mainnet.alchemyapi.io/v2/",
    CONF_API_L1_KEY = "koekjes",
    CONF_TIMEOUT_ENS_DOMAIN = 7200000, //< 2 hours
    CONF_KEY_EXPIRY = 3600000, //< 1 hour
    CONF_MASTER_PORT = 42069,
    CONF_PRESHARED_MASTER_KEY = "koekjes",
    CONF_SCORE_TIMEOUT = 300000, //< 5 minutes
    CONF_SLEEPTIME = 2000, //< 2 seconds
} = process.env;
```

    pm2 start ecosystem.config.cjs

### Run development

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    CONF_API_L1_HTTP = "https://eth-mainnet.alchemyapi.io/v2/",
    CONF_API_L1_KEY = "koekjes",
    CONF_TIMEOUT_ENS_DOMAIN = 7200000, //< 2 hours
    CONF_KEY_EXPIRY = 3600000, //< 1 hour
    CONF_MASTER_PORT = 42069,
    CONF_PRESHARED_MASTER_KEY = "koekjes",
    CONF_SCORE_TIMEOUT = 60000, //< 1 minute
    CONF_SLEEPTIME = 2000, //< 2 seconds
} = process.env;
```

    npm run dev


