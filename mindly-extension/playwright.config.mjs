import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export default defineConfig({testDir:'./tests',testMatch:'browser.spec.mjs',workers:1,timeout:45_000,outputDir:'../.qa/extension-results',reporter:'list',webServer:{command:'npm start',cwd:root,url:'http://127.0.0.1:4173',reuseExistingServer:true}});
