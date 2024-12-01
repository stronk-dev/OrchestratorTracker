const express = require("express");
const { Worker } = require("worker_threads");
const worker = new Worker("./worker.js");
const masterRouter = express.Router();
const {
  CONF_PRESHARED_MASTER_KEY,
} = require("../config.js");

// Worker Message Handler
worker.on("message", (message) => {
  if (message.type === "error") {
    console.error("Worker Error:", message.error);
  }
});

worker.on("error", (error) => {
  console.error("Worker encountered an error:", error);
});

// Collect Stats Endpoint
masterRouter.post("/collectStats", async (req, res) => {
  if (!req.body) {
    res.status(400).send("Invalid request");
    return;
  }
  const { batchResults, tag, key, region, livepeer_regions } = req.body;
  if (!batchResults || !tag || !key || !region || !livepeer_regions) {
    console.log("Received malformed data. Aborting stats update...");
    console.log(batchResults, tag, key, region, livepeer_regions);
    res.send(false);
    return;
  }
  if (CONF_PRESHARED_MASTER_KEY != key) {
    console.log("Unauthorized");
    res.send(false);
    return;
  }
  worker.postMessage({
    type: "collectStats",
    data: { batchResults, tag, key, region, livepeer_regions },
  });

  res.send(true);
});

// Prometheus Metrics Endpoint
masterRouter.get("/prometheus", async (req, res) => {
  worker.postMessage({ type: "prometheus" });
  worker.once("message", (message) => {
    if (message.type === "prometheus") {
      res.set("Content-Type", "text/plain");
      res.end(message.data);
    }
  });
});

// JSON Data Endpoint
masterRouter.get("/json", async (req, res) => {
  worker.postMessage({ type: "json" });
  worker.once("message", (message) => {
    if (message.type === "json") {
      res.set("Content-Type", "application/json");
      res.end(message.data);
    }
  });
});

// Start Server
console.log("Starting main handler...");
exports.masterRouter = masterRouter;
