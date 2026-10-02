const base=require('./playwright.config.js');
module.exports={...base,workers:1,use:{...base.use,headless:true},webServer:{command:'node tests/helpers/session-http-server.cjs',url:'http://127.0.0.1:8875/home.html',reuseExistingServer:false,timeout:10000,stdout:'ignore',stderr:'ignore'}};
