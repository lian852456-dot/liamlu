// Use npm-installed Playwright; optional overrides support an existing local runtime.
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
module.exports={...pw,chromiumOptions:{headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader']}};
