module.exports = {
   apps: [
      {
         name: "client-orchestrator-prober",
         script: "./src/client.js",
         cwd: "/home/marco/repos/OrchestratorAvailability/client",
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
