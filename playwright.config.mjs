import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4173',channel:'chrome',headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'},
  webServer:{command:'npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true},
  reporter:'list'
});
