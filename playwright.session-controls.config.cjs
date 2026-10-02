const base=require('./playwright.config.js');
module.exports={...base,workers:1,use:{...base.use,headless:true},webServer:{command:'python3 -m http.server 8875 --bind 127.0.0.1',url:'http://127.0.0.1:8875/home.html',reuseExistingServer:false,timeout:10000,stdout:'ignore',stderr:'ignore'}};
