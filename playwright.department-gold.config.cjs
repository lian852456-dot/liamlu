const base=require('./playwright.config.js');
module.exports={...base,webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1',url:'http://127.0.0.1:8765/department-ops.html',reuseExistingServer:true,timeout:10000}};
