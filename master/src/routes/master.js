import express, { response } from "express";
import {
  PRESHARED_MASTER_KEY, CONF_ENS_TIMEOUT
} from "../config";
const https = require('https');
const storage = require('node-persist');
const masterRouter = express.Router();
const client = require('prom-client');
const register = new client.Registry();
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 3000 });
const promLatestLatency = new client.Gauge({
  name: 'orch_latest_latency',
  help: 'Latest latency known for a given Orchestrator',
  labelNames: ['region', 'orchestrator']
});
register.registerMetric(promLatestLatency);
const promLatency = new client.Summary({
  name: 'orch_latency',
  help: 'Summary of latency stats',
  percentiles: [0.01, 0.1, 0.9, 0.99],
  labelNames: ['region']
});
register.registerMetric(promLatency);
const promAverageLatency = new client.Gauge({
  name: 'orch_average_latency',
  help: 'Average latency for a given Orchestrator',
  labelNames: ['region', 'orchestrator']
});
register.registerMetric(promAverageLatency);
const promAUptimeScore = new client.Gauge({
  name: 'orch_uptime_score',
  help: 'Uptime score for a given orchestrator',
  labelNames: ['region', 'orchestrator']
});
register.registerMetric(promAUptimeScore);

let isSynced = false;



/*

ENS data from nFrame
[{"domain":null,"address":"0xc3c7c4c8f7061b7d6a72766eee5359fe4f36e61e","timestamp":1659963951567}]

*/


let ensData = [];
let lastUpdated = 0;

const updateEns = async function () {
  try {
    const url = "https://stronk.rocks/api/livepeer/getEnsDomains";
    console.log("Getting new ENS data from " + url);

    https.get(url, (res2) => {
      let body = "";
      res2.on("data", (chunk) => {
        body += chunk;
      });
      res2.on("end", () => {
        try {
          const data = JSON.parse(body);
          for (const newOrchData of data) {
            if (!newOrchData) { continue; }
            if (!newOrchData.domain) { continue; }
            var found = false;
            for (var orchIdx = 0; orchIdx < ensData.length; orchIdx++) {
              if (ensData[orchIdx].address != newOrchData.address) { continue; }
              ensData[orchIdx] = newOrchData;
              found = true;
              break;
            }
            if (!found) {
              ensData.push(newOrchData);
            }
          }
          storage.setItem('ensData', ensData);
        } catch (error) {
          console.error(error.message);
        };
      });
    }).on("error", (error) => {
      console.error(error.message);
    });
  } catch (err) {
    console.log(err);
  }
}


/*

Incoming stats parsing

*/

masterRouter.post("/collectStats", async (req, res) => {
  try {
    if (!isSynced) { console.log("waiting for sync"); res.end('busy'); return; }
    const { id, discoveryResults, responseTime, tag, key } = req.body;
    if (!id || !tag || !key) {
      console.log("Received malformed data. Aborting stats update...");
      console.log(id, discoveryResults, responseTime, tag, key);
      res.send(false);
      return;
    }
    if (PRESHARED_MASTER_KEY != key) {
      console.log("Unauthorized");
      res.send(false);
      return;
    }
    let thisId = id;
    if (responseTime) {
      for (const thisEns of ensData) {
        if (!thisEns || !thisEns.domain);
        if (thisEns.address != thisId) { continue; }
        thisId = thisEns.domain;
      }
      promLatestLatency.set({ region: tag, orchestrator: thisId }, responseTime);
      promLatency.observe({ region: tag }, responseTime);
    }
    console.log('received data for ' + thisId + ' from ' + tag + ' (' + responseTime + " ms latency)");
    // Save data point
    const now = new Date().getTime();
    // Update ENS from nframe if expired
    if (now - lastUpdated > CONF_ENS_TIMEOUT) {
      await updateEns();
      lastUpdated = now;
    }
    let thisPing = responseTime;
    if (!discoveryResults || !responseTime) { thisPing = null; }
    let currentDataList = [];
    let orchFound = false;
    let regionFound = false;
    for (var orchIdx = 0; orchIdx < orchScores.length; orchIdx++) {
      if (orchScores[orchIdx].id != thisId) { continue; }
      orchFound = true;
      for (var regionIdx = 0; regionIdx < orchScores[orchIdx].data.length; regionIdx++) {
        if (orchScores[orchIdx].data[regionIdx].tag != tag) { continue; }
        regionFound = true;
        if (orchScores[orchIdx].data[regionIdx].data.length > 60) {
          orchScores[orchIdx].data[regionIdx].data = orchScores[orchIdx].data[regionIdx].data.slice(1);
        }
        orchScores[orchIdx].data[regionIdx].data.push({ latency: thisPing, timestamp: now });
        currentDataList = orchScores[orchIdx].data[regionIdx].data;
        break;
      }
      if (!regionFound) {
        currentDataList = [{ latency: thisPing, timestamp: now }];
        orchScores[orchIdx].data.push({ tag, data: currentDataList });
      }
      break;
    }
    if (!orchFound) {
      currentDataList = [{ latency: thisPing, timestamp: now }];
      orchScores.push({ id: thisId, data: [{ tag, data: currentDataList }] });
    }
    await storage.setItem('orchScores', orchScores);
    // Calc new scores
    let prevtime = null;
    let uptime = 0;
    let downtime = 0;
    let pingsum = 0;
    let pingpoints = 0;
    for (const thisData of currentDataList) {
      // Count ping* vars
      if (thisData.latency) {
        pingsum += thisData.latency;
        pingpoints += 1;
        promLatestLatency.set({ region: tag, orchestrator: thisId }, thisData.latency);
        promLatency.observe({ region: tag }, thisData.latency);
      }
      // Only count *time vars if we have timestamps
      if (prevtime && thisData.timestamp) {
        if (thisData.latency) {
          uptime += thisData.timestamp - prevtime;
        } else {
          downtime += thisData.timestamp - prevtime;
        }
      }
      prevtime = thisData.timestamp;
    }
    if (pingpoints) {
      promAverageLatency.set({ region: tag, orchestrator: thisId }, pingsum / pingpoints);
    }
    if (uptime || downtime) {
      let score;
      if (!uptime) { score = 0; }
      else { score = uptime / (uptime + downtime); }
      promAUptimeScore.set({ region: tag, orchestrator: thisId }, score);
    }
    res.send(true);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
});


/*

Public endpoints

*/


masterRouter.get("/prometheus", async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(400).send(err);
  }
});

masterRouter.get("/json", async (req, res) => {
  try {
    res.set('Content-Type', 'application/json');
    res.end(JSON.stringify(orchScores));
  } catch (err) {
    res.status(400).send(err);
  }
});


/*

Recover from storage

*/


let orchScores;

const recoverStorage = async function () {
  await storage.init({
    stringify: JSON.stringify,
    parse: JSON.parse,
    encoding: 'utf8',
    logging: false,
    ttl: false,
    forgiveParseErrors: false
  });
  ensData = await storage.getItem('ensData');
  if (!ensData) { ensData = []; }
  orchScores = await storage.getItem('orchScores');
  if (!orchScores) { orchScores = []; }
  // Init prometheus from storage
  for (const thisOrch of orchScores) {
    console.log("recovering scores for " + thisOrch.id);
    for (const thisRegion of thisOrch.data) {
      let prevtime = null;
      let uptime = 0;
      let downtime = 0;
      let pingsum = 0;
      let pingpoints = 0;
      for (const thisData of thisRegion.data) {
        // Count ping* vars
        if (thisData.latency) {
          pingsum += thisData.latency;
          pingpoints += 1;
          promLatestLatency.set({ region: thisRegion.tag, orchestrator: thisOrch.id }, thisData.latency);
          promLatency.observe({ region: thisRegion.tag }, thisData.latency);
        }
        // Only count *time vars if we have timestamps
        if (prevtime && thisData.timestamp) {
          if (thisData.latency) {
            uptime += thisData.timestamp - prevtime;
          } else {
            downtime += thisData.timestamp - prevtime;
          }
        }
        prevtime = thisData.timestamp;
      }
      if (pingpoints) {
        promAverageLatency.set({ region: thisRegion.tag, orchestrator: thisOrch.id }, pingsum / pingpoints);
      }
      if (uptime || downtime) {
        const score = uptime / (uptime + downtime)
        promAUptimeScore.set({ region: thisRegion.tag, orchestrator: thisOrch.id }, score);
      }
    }
  }
  isSynced = true;
}
recoverStorage();





export default masterRouter;
