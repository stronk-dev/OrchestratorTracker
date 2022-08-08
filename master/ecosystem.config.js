module.exports = {
   apps: [
      {
         name: "hodler",
         script: "./src/hodler.js",
         cwd: "/orchTest/master",
         env_production: {
            NODE_ENV: "production"
         },
         env_development: {
            NODE_ENV: "development"
         },
         env_local: {
            NODE_ENV: "local"
         }
      }
   ]
}
