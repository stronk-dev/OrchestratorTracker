module.exports = {
   apps: [
      {
         name: "orchProber",
         script: "./src/orchProber.js",
         cwd: "/orchTest/client",
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
