
### Config variables
```
  {
    MASTER_PORT: what port the master is listening on
    PRESHARED_MASTER_KEY: clients must provide this value when uploading stats
  }
```
### Run production
Note: this folder has to be placed in `/orchTest/master`

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    MASTER_PORT = 42069,
    PRESHARED_MASTER_KEY = "koekjes"
} = process.env;
```

    pm2 start ecosystem.config.js

### Run development

    npm install
    nano src/config.js

example `config.js`:
```
export const {
    MASTER_PORT = 42069,
    PRESHARED_MASTER_KEY = "koekjes"
} = process.env;
```

    npm run dev

