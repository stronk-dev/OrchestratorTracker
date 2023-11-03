const { runTests } = require("./util/orchTester.js");

(async () => {
  // On first boot, kickstart the test loop
  console.log("Starting main loop...");
  runTests();
})();
