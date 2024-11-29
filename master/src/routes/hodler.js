const express = require("express");
const client = require("prom-client");
const { ethers } = require("ethers");
const storage = require("node-persist");
const {
  CONF_API_L1_HTTP,
  CONF_API_L1_KEY,
  CONF_PRESHARED_MASTER_KEY,
  CONF_TIMEOUT_ENS_DOMAIN,
  CONF_KEY_EXPIRY,
  CONF_SCORE_TIMEOUT,
  CONF_SLEEPTIME,
} = require("../config.js");

/*

  Init

*/

const l1provider = new ethers.providers.JsonRpcProvider(
  CONF_API_L1_HTTP + CONF_API_L1_KEY
);
const masterRouter = express.Router();
const register = new client.Registry();

// Regional stats - prober instance specific
const promLatestLatency = new client.Gauge({
  name: "orch_latest_latency",
  help: "Latest latency known for a given Orchestrator",
  labelNames: ["region", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promLatestLatency);
const promLatency = new client.Summary({
  name: "orch_latency",
  help: "Summary of latency stats",
  percentiles: [0.01, 0.1, 0.9, 0.99],
  labelNames: ["region"],
});
register.registerMetric(promLatency);
const promAverageLatency = new client.Gauge({
  name: "orch_average_latency",
  help: "Average latency for a given Orchestrator",
  labelNames: ["region", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promAverageLatency);

// Regional stats - Livepeer test stream specific
const promLatestRTR = new client.Gauge({
  name: "orch_latest_rtr",
  help: "Latest realtime ratio as specified by Livepeer inc's regional performance leaderboards",
  labelNames: ["livepeer_region", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promLatestRTR);
const promLatestSuccessRate = new client.Gauge({
  name: "orch_latest_success_rate",
  help: "Latest success rate as specified by Livepeer inc's regional performance leaderboards",
  labelNames: ["livepeer_region", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promLatestSuccessRate);

// Global stats - orchestrator instance specific
const promLatestPPP = new client.Gauge({
  name: "orch_latest_ppp",
  help: "Latest price per pixel known for a given Orchestrator",
  labelNames: ["instance", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promLatestPPP);
const promAUptimeScore = new client.Gauge({
  name: "orch_uptime_score",
  help: "Uptime score for a given orchestrator",
  labelNames: ["instance", "orchestrator", "latitude", "longitude"],
});
register.registerMetric(promAUptimeScore);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*

  Globals

*/

let ensDomainCache = {};
let orchCache = {};
let lastLeaderboardCheck = 0;
let isSynced = false;

/*

ENS

*/

const getEnsDomain = async function (addr) {
  try {
    const now = new Date().getTime();
    const cached = ensDomainCache[addr];
    if (cached && now - cached.timestamp < CONF_TIMEOUT_ENS_DOMAIN) {
      return cached.domain ? cached.domain : cached.address;
    }
    // Refresh cause not cached or stale
    const ensDomain = await l1provider.lookupAddress(addr);
    let ensObj;
    if (!ensDomain) {
      let domain = null;
      if (cached) {
        domain = cached.domain;
      }
      ensObj = {
        domain: domain,
        address: addr,
        timestamp: now,
      };
    } else {
      ensObj = {
        domain: ensDomain,
        address: addr,
        timestamp: now,
      };
    }
    console.log(
      "Updated ENS domain " +
        ensObj.domain +
        " owned by " +
        ensObj.address +
        " @ " +
        ensObj.timestamp
    );
    ensDomainCache[addr] = ensObj;
    await storage.setItem("ensDomainCache", ensDomainCache);
    if (ensObj.domain) {
      // Update domain name
      return ensObj.domain;
    } else {
      if (cached.domain) {
        // Reuse last cached domain
        return cached.domain;
      } else {
        // Return ETH addr
        return ensObj.address;
      }
    }
  } catch (err) {
    console.log(err);
    console.log("Error looking up ENS info, retrying...");
    await sleep(200);
    return null;
  }
};

/*

  Update cache & prometheus

*/

const updatePrometheus = async function (tag, instance, orchInfo) {
  const thisInstance = orchInfo.instances[instance];
  const regionInfo = orchInfo.regionalStats[tag];
  if (regionInfo.latestDiscoveryTime) {
    promLatestLatency.set(
      {
        region: tag,
        orchestrator: orchInfo.name,
        latitude: thisInstance.latitude,
        longitude: thisInstance.longitude,
      },
      regionInfo.latestDiscoveryTime
    );
  }
  if (regionInfo.avgDiscoveryTime) {
    promAverageLatency.set(
      {
        region: tag,
        orchestrator: orchInfo.name,
        latitude: thisInstance.latitude,
        longitude: thisInstance.longitude,
      },
      regionInfo.avgDiscoveryTime
    );
  }
  promAUptimeScore.set(
    {
      instance: instance,
      orchestrator: orchInfo.name,
      latitude: thisInstance.latitude,
      longitude: thisInstance.longitude,
    },
    regionInfo.uptimePercentage
  );
  promLatestPPP.set(
    {
      instance: instance,
      orchestrator: orchInfo.name,
      latitude: thisInstance.latitude,
      longitude: thisInstance.longitude,
    },
    thisInstance.price
  );
  promLatency.observe({ region: tag }, regionInfo.latestDiscoveryTime);
};

const onOrchUpdate = async function (id, obj, tag, region, livepeer_regions) {
  const now = new Date().getTime();
  // Overwrite name with ENS domain if set
  let ensDomain = null;
  while (!ensDomain) {
    ensDomain = await getEnsDomain(id.toLowerCase());
  }
  // Retrieve entry to update or init it
  let newObj = orchCache[id.toLowerCase()];
  if (!newObj) {
    newObj = {
      name: ensDomain,
      id: id.toLowerCase(),
      regionalStats: {},
      instances: {},
      leaderboardResults: { lastTime: now },
    };
  } else {
    newObj.name = ensDomain;
    newObj.id = id.toLowerCase()
  }
  // Find region entry or init it
  let newRegion = newObj.regionalStats[tag];
  if (!newRegion) {
    newRegion = {
      measurements: [],
      avgDiscoveryTime: -1,
      uptimePercentage: 1.0,
      latestDiscoveryTime: -1,
    };
  }

  // Record measurement
  let measurement = {
    latency: obj.discovery.latency,
    timestamp: now,
    duration: 0,
  };
  if (newRegion.measurements.length) {
    measurement.duration =
      now - newRegion.measurements[newRegion.measurements.length - 1].timestamp;
  }
  newRegion.measurements.push(measurement);
  if (newRegion.measurements.length > 60) {
    newRegion.measurements = newRegion.measurements.slice(1);
  }

  // Recalc average && uptime
  let uptime = 0;
  let downtime = 0;
  let pingSum = 0;
  let pingEntries = 0;
  for (const measurement of newRegion.measurements) {
    if (measurement.latency && measurement.latency > 0) {
      if (measurement.duration) {
        uptime += measurement.duration;
      }
      pingSum += measurement.latency;
      pingEntries++;
    } else {
      if (measurement.duration) {
        downtime += measurement.duration;
      }
    }
  }

  if (pingEntries > 0) {
    newRegion.avgDiscoveryTime = pingSum / pingEntries;
  } else {
    newRegion.avgDiscoveryTime = measurement.latency;
  }
  newRegion.latestDiscoveryTime = measurement.latency;

  if (
    downtime ||
    (!newRegion.avgDiscoveryTime && !newRegion.latestDiscoveryTime)
  ) {
    if (!uptime) {
      newRegion.uptimePercentage = 0.0;
    } else {
      newRegion.uptimePercentage = uptime / (uptime + downtime);
    }
  }

  // Find instance entry or init it
  let newInstance = newObj.instances[obj.resolv.resolvedTarget];
  if (!newInstance) {
    newInstance = {
      price: -1,
      latitude: -1,
      longitude: -1,
      version: "",
      probedFrom: {},
      regions: {},
      livepeer_regions: {},
    };
  }

  // Remove expired stuff
  Object.keys(newInstance.probedFrom).forEach((key) => {
    if (
      !newInstance.probedFrom[key] ||
      !newInstance.probedFrom[key].lastTime ||
      now - newInstance.probedFrom[key].lastTime > CONF_KEY_EXPIRY
    ) {
      console.log(
        "Removing expired key " +
          key +
          " from the probed-from cache for orch " +
          id
      );
      delete newInstance.probedFrom[key];
    }
  });
  Object.keys(newInstance.regions).forEach((key) => {
    if (
      !newInstance.regions[key] ||
      !newInstance.regions[key].lastTime ||
      now - newInstance.regions[key].lastTime > CONF_KEY_EXPIRY
    ) {
      console.log(
        "Removing expired key " + key + " from the regions cache for orch " + id
      );
      delete newInstance.regions[key];
    }
  });
  Object.keys(newInstance.livepeer_regions).forEach((key) => {
    if (
      !newInstance.livepeer_regions[key] ||
      !newInstance.livepeer_regions[key].lastTime ||
      now - newInstance.livepeer_regions[key].lastTime > CONF_KEY_EXPIRY
    ) {
      console.log(
        "Removing expired key " +
          key +
          " from the livepeer regions cache for orch " +
          id
      );
      delete newInstance.livepeer_regions[key];
    }
  });

  // Set last times for instance info
  newInstance.probedFrom[tag] = {
    lastTime: now,
  };
  newInstance.regions[region] = {
    lastTime: now,
  };
  for (const region of livepeer_regions) {
    newInstance.livepeer_regions[region] = {
      lastTime: now,
    };
  }

  // Set location and price info
  if (obj.discovery.price_info) {
    newInstance.price =
      obj.discovery.price_info.pricePerUnit /
      obj.discovery.price_info.pixelsPerUnit;
  }
  if (obj.discovery.version) {
    newInstance.version = obj.discovery.version;
  }
  if (obj.resolv.geoLookup) {
    newInstance.latitude = obj.resolv.geoLookup.latitude;
    newInstance.longitude = obj.resolv.geoLookup.longitude;
  }

  // Finished updating
  newObj.instances[obj.resolv.resolvedTarget] = newInstance;
  newObj.regionalStats[tag] = newRegion;
  orchCache[id.toLowerCase()] = newObj;
  await storage.setItem("orchCache", orchCache);

  // Update prometheus stats
  updatePrometheus(tag, obj.resolv.resolvedTarget, newObj);
  console.log("Handled results for " + newObj.name + " from prober " + tag);
};

const updateCache = async function (
  batchResults,
  tag,
  region,
  livepeer_regions
) {
  console.log("Parsing stats from " + tag + " (" + region + ")");

  for (const [id, obj] of Object.entries(batchResults)) {
    onOrchUpdate(id, obj, tag, region, livepeer_regions);
  }
};

/*

Public endpoints

*/

// Mutate state with new stats
masterRouter.post("/collectStats", async (req, res) => {
  if (!isSynced) {
    res.send("busy");
    return;
  }
  try {
    const { batchResults, tag, key, region, livepeer_regions } = req.body;
    if (!batchResults || !tag || !key || !region || !livepeer_regions) {
      console.log("Received malformed data. Aborting stats update...");
      console.log(batchResults, tag, key, region, livepeer_regions);
      res.send(false);
      return;
    }
    if (CONF_PRESHARED_MASTER_KEY != req.body.key) {
      console.log("Unauthorized");
      res.send(false);
      return;
    }
    updateCache(batchResults, tag, region, livepeer_regions);
    res.send(true);
  } catch (err) {
    console.log(err, req.body);
    res.status(400).send(err);
  }
});

// Retrieve prom data
masterRouter.get("/prometheus", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(400).send(err);
  }
});

// Retrieve cache as JSON
masterRouter.get("/json", async (req, res) => {
  try {
    res.set("Content-Type", "application/json");
    res.end(JSON.stringify(orchCache));
  } catch (err) {
    res.status(400).send(err);
  }
});

/*

Main Loop

*/

const updateScore = async function (address) {
  console.log("Checking for new scores for " + address);
  const thisInstances = orchCache[address.toLowerCase()].instances;
  const thisName = orchCache[address.toLowerCase()].name;
  const lastTime = orchCache[address.toLowerCase()].leaderboardResults.lastTime;

  let url =
    "https://leaderboard-serverless.vercel.app/api/raw_stats?orchestrator=" +
    address;

  const json = await fetch(url).then((res) => res.json());
  let hasEdited = false;
  for (const [region, results] of Object.entries(json)) {
    for (const instance of results) {
      if (instance.timestamp * 1000 > lastTime) {
        const newSR = instance.success_rate;
        const newRTR = instance.round_trip_time / instance.seg_duration;
        let latitude = null;
        let longitude = null;
        for (const [resolvedTarget, instance] of Object.entries(
          thisInstances
        )) {
          if (instance.livepeer_regions[region]) {
            latitude = instance.latitude;
            longitude = instance.longitude;
          }
        }
        console.log(
          "Found new RTR=" +
            newRTR +
            " and new success rate of " +
            newSR * 100 +
            "%, livepeer region " +
            instance.region
        );
        promLatestRTR.set(
          {
            livepeer_region: instance.region,
            orchestrator: thisName,
            latitude: latitude,
            longitude: longitude,
          },
          newRTR
        );
        promLatestSuccessRate.set(
          {
            livepeer_region: instance.region,
            orchestrator: thisName,
            latitude: latitude,
            longitude: longitude,
          },
          newSR
        );
        if (
          !orchCache[address.toLowerCase()].leaderboardResults[instance.region]
        ) {
          orchCache[address.toLowerCase()].leaderboardResults[instance.region] =
            {};
        }
        orchCache[address.toLowerCase()].leaderboardResults[
          instance.region
        ].latestRTR = newRTR;
        orchCache[address.toLowerCase()].leaderboardResults[
          instance.region
        ].latestSR = newSR;
        hasEdited = true;
      }
    }
  }
  if (hasEdited) {
    orchCache[address.toLowerCase()].leaderboardResults.lastTime =
      new Date().getTime();
  }
};

const updateOrchScores = async function () {
  for (const [id, obj] of Object.entries(orchCache)) {
    await updateScore(id);
  }
};

const recoverStorage = async function () {
  await storage.init({
    stringify: JSON.stringify,
    parse: JSON.parse,
    encoding: "utf8",
    logging: false,
    ttl: false,
    forgiveParseErrors: false,
  });
  storedDomains = await storage.getItem("ensDomainCache");
  if (storedDomains) {
    ensDomainCache = storedDomains;
  }
  storedOrchs = await storage.getItem("orchCache");
  if (storedOrchs) {
    orchCache = storedOrchs;
  }

  // Re-init from storage
  for (const [id, obj] of Object.entries(orchCache)) {
    const thisName = obj.name;
    const thisInstances = obj.instances;

    // Latest leaderboard results observed
    if (obj.leaderboardResults) {
      for (const [region, res] of Object.entries(obj.leaderboardResults)) {
        // Skip the lastTime accessor - only use last observed regional stats
        if (res.latestRTR == null || res.latestSR == null) {
          continue;
        }
        console.log(
          "Re-init leaderboard scores for orch=" +
            id +
            ", RTR=" +
            res.latestRTR +
            " and success rate of " +
            res.latestSR * 100 +
            "%, livepeer region " +
            region
        );
        let latitude = null;
        let longitude = null;
        for (const [resolvedTarget, instance] of Object.entries(
          thisInstances
        )) {
          if (instance.livepeer_regions[region]) {
            latitude = instance.latitude;
            longitude = instance.longitude;
          }
        }
        promLatestRTR.set(
          {
            livepeer_region: region,
            orchestrator: thisName,
            latitude: latitude,
            longitude: longitude,
          },
          res.latestRTR
        );
        promLatestSuccessRate.set(
          {
            livepeer_region: region,
            orchestrator: thisName,
            latitude: latitude,
            longitude: longitude,
          },
          res.latestSR
        );
      }
    }
  }
  isSynced = true;
};
recoverStorage();

const runTests = async function () {
  try {
    const now = new Date().getTime();
    if (
      !lastLeaderboardCheck ||
      now - lastLeaderboardCheck > CONF_SCORE_TIMEOUT
    ) {
      await updateOrchScores();
      lastLeaderboardCheck = now;
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
console.log("Starting watcher for test stream results");
runTests();

exports.masterRouter = masterRouter;
