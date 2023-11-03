const dns = require("dns");
const geoip = require("geoip-lite");
const { request, gql } = require("graphql-request");
const https = require("https");
const http = require("http");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const {
  CONF_MASTER_PORT,
  CONF_MASTER_DOMAIN,
  CONF_MASTER_PATH,
  CONF_FRIENDLY_NAME,
  CONF_REGION,
  CONF_LP_REGIONS,
  CONF_MAX_LATENCY,
  CONF_ROUNDTIME,
  CONF_CONCURRENCY,
  CONF_SLEEPTIME,
  CONF_ORCHINFO_TIMEOUT,
  CONF_BROADCASTER,
  CONF_DNS_TIMEOUT,
  CONF_PRESHARED_MASTER_KEY,
  CONF_SIGNATURE,
} = require("../config.js");

/*

INIT
imported modules

*/

var packageDefinition = protoLoader.loadSync("src/proto/livepeer.proto", {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
var livepeerProto = grpc.loadPackageDefinition(packageDefinition).net;
const ssl_creds = grpc.credentials.createSsl(null, null, null, {
  checkServerIdentity: () => undefined,
});
// Since go-livepeer uses self-signed certificates or something
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/*

Global variables

*/

var activeOrchestrators = []; //< List of all active orchs pulled from the graph
var orchestratorsLastUpdated = 0; //< Used to refresh above list periodically
var lastRoundStart = 0;
let orchDNS = {}; //< Caches DNS and GEO lookups
let currentPool = []; //< Current working set of Orchestrators to test
let cycle = 0; //< Rounds of testing the script has done
let batchResults = {}; //< Current cache of results to batch upload
let currentPending = 0; //< Current outstanding requests

/*

Global helper functions

*/

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

function hexToBytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}

/*

Doing grpc calls to an orchestrator and uploading to the hodler

*/

const batchPostStats = async function () {
  var postData = JSON.stringify({
    batchResults: batchResults,
    tag: CONF_FRIENDLY_NAME,
    key: CONF_PRESHARED_MASTER_KEY,
    region: CONF_REGION,
    livepeer_regions: CONF_LP_REGIONS,
  });
  var options = {
    hostname: CONF_MASTER_DOMAIN,
    port: CONF_MASTER_PORT,
    path: CONF_MASTER_PATH,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": postData.length,
    },
  };
  console.log("Uploading " + postData.length + " B of stats");
  var req;
  if (CONF_MASTER_DOMAIN == "127.0.0.1" || CONF_MASTER_DOMAIN == "localhost") {
    req = http.request(options, (res) => {
      res.on("data", (d) => {
        process.stdout.write(
          "Received response " + d + " from " + CONF_MASTER_DOMAIN
        );
      });
    });
  } else {
    req = https.request(options, (res) => {
      res.on("data", (d) => {
        process.stdout.write(
          "Received response " + d + " from " + CONF_MASTER_DOMAIN
        );
      });
    });
  }
  req.on("error", (e) => {
    console.error("err", e);
  });
  req.write(postData);
  req.end();
};

const discoverOrchestrator = async function (target) {
  if (!target) {
    return;
  }
  // Try to prevent the connection from being reused
  var client = new livepeerProto.Orchestrator(target, ssl_creds, {
    GRPC_ARG_DEFAULT_AUTHORITY: Math.random().toString(36).substr(2, 5),
  });
  var receivedResults = false;
  var orchestratorInfo = {};
  const start = new Date().getTime();
  var elapsed = 0;
  await client.GetOrchestrator(
    {
      address: hexToBytes(CONF_BROADCASTER),
      sig: CONF_SIGNATURE,
    },
    function (err, res) {
      if (err) {
        console.log("Discovery error: ", err.details);
        orchestratorInfo.err = err.details;
      } else {
        orchestratorInfo = res;
        elapsed = new Date().getTime() - start;
      }
      receivedResults = true;
    }
  );
  // Wait for a max of 4 seconds for a callback from the GRPC call
  while (!receivedResults && new Date().getTime() - start < CONF_MAX_LATENCY) {
    await sleep(20);
  }
  grpc.closeClient(client);
  if (!orchestratorInfo) {
    return {
      discoveryResults: {
        transcoder: null,
        price_info: null,
        latency: 0,
        err: "Took too long to respond. Aborted test...",
      },
    };
  }
  return {
    discoveryResults: {
      transcoder: orchestratorInfo.transcoder,
      price_info: orchestratorInfo.price_info,
      latency: elapsed,
      err: orchestratorInfo.err,
    },
  };
};

// Resolve hostname to IP
async function getIP(hostname) {
  let obj = await dns.promises.lookup(hostname).catch((error) => {
    console.error(error);
  });
  if (obj) {
    return obj.address;
  } else {
    return null;
  }
}

const testOrchestrator = async function (id, target) {
  if (!id.length || !target.length) {
    return;
  }
  const origTarget = new URL(target);
  target = target.replace(/^https?:\/\//, "");
  console.log("Testing orchestrator  " + target);
  // Resolve DNS and GEO
  const now = new Date().getTime();
  if (!orchDNS[id] || now - orchDNS[id].lastTime > CONF_DNS_TIMEOUT) {
    const resolved = await getIP(origTarget.hostname);
    const geo = geoip.lookup(resolved);
    let geoObj = null;
    if (geo) {
      geoObj = {
        // country: geo.country, //< commented out these fields
        // region: geo.region,   // since they're causing issues with JSON.stringify()
        // city: geo.city,       // prob due to special characters
        latitude: geo.ll[0],
        longitude: geo.ll[1],
      };
    }
    orchDNS[id] = {
      originalTarget: origTarget.origin,
      resolvedTarget: resolved,
      geoLookup: geoObj,
      geoFrom: CONF_FRIENDLY_NAME,
      lastTime: now,
    };
    console.log("Updated DNS and GeoIP data for " + id);
  }
  // Test orch
  const { discoveryResults } = await discoverOrchestrator(target);
  if (
    discoveryResults &&
    discoveryResults.err == "insufficient sender reserve"
  ) {
    console.log("Ignoring " + id + " due to insufficient sender reserve");
    return;
  }
  // Cache results
  batchResults[id] = {
    name: id,
    discovery: discoveryResults,
    resolv: orchDNS[id],
  };
  if (discoveryResults.err) {
    batchResults[id].discovery.latency = 0;
  }
  currentPending--;
};

/*

  Batch test logic

*/

const batchTestOrchs = async function () {
  // Clear buff
  batchResults = {};
  currentPending = 0;
  // Keep going until we've got no more todo or pending
  while (currentPool.length || currentPending) {
    // Concurrent requests
    while (currentPending < CONF_CONCURRENCY && currentPool.length) {
      let currentOrch = currentPool.splice(0, 1)[0];
      if (!currentOrch.id || !currentOrch.target) {
        console.log("Skipping Orchestrator with malformed data: ", currentOrch);
        continue;
      }
      currentPending++;
      testOrchestrator(currentOrch.id, currentOrch.target);
    }
    await sleep(50);
  }
  batchPostStats();
};

/*

Refreshing active orchestrators
Pulls this data from the Livepeer subgraph (https://api.thegraph.com/subgraphs/name/livepeer/arbitrum-one/graphql)

*/

/// Does a GQL query to the subgraph for orchestrator data
const getOrchestrators = async function () {
  console.log("Getting orchestrator data from the subgraph...");
  try {
    const orchQuery = gql`
      {
        transcoders(where: { active: true }, first: 1000) {
          id
          status
          totalStake
          serviceURI
        }
      }
    `;
    let orchData = await request(
      "https://api.thegraph.com/subgraphs/name/livepeer/arbitrum-one",
      orchQuery
    );
    orchData = orchData.transcoders;
    if (!orchData) {
      console.log("Thegraph is probably acting up...");
      return null;
    }
    return orchData;
  } catch (err) {
    console.log(err);
    console.log("Thegraph is probably acting up...");
    return null;
  }
};

/// Refreshes orchestrator data if the subgraph is available
const refreshOrchCache = async function () {
  const now = new Date().getTime();
  // Update cmc once their data has expired
  if (now - orchestratorsLastUpdated > CONF_ORCHINFO_TIMEOUT) {
    const data = await getOrchestrators();
    if (data) {
      activeOrchestrators = data;
      orchestratorsLastUpdated = now;
    }
  }
};

// Creates a new working set of orchs to test
const refreshPool = function () {
  currentPool = [];
  for (const thisObj of activeOrchestrators) {
    currentPool.push({ id: thisObj.id, target: thisObj.serviceURI });
  }
  shuffle(currentPool);
};

/*

Main Loop

*/

const runTests = async function () {
  try {
    const now = new Date().getTime();
    if (!lastRoundStart || now - lastRoundStart > CONF_ROUNDTIME) {
      cycle++;
      console.log("Starting new cycle #" + cycle);
      // If stale, retrieve new set of active orchestrators
      await refreshOrchCache();
      // Create a new shuffled working set of orchs to test
      refreshPool();
      // Test all orchs in working set
      await batchTestOrchs();
      lastRoundStart = now;
    }
    setTimeout(() => {
      runTests();
    }, CONF_SLEEPTIME);
    return;
  } catch (err) {
    console.log(err);
    setTimeout(() => {
      runTests();
    }, CONF_SLEEPTIME);
  }
};

exports.runTests = runTests;
