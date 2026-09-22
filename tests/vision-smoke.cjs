const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.FACE_FIXTURE){
   const image='data:image/jpeg;base64,'+require('node:fs').readFileSync(process.env.FACE_FIXTURE).toString('base64');
   await page.addInitScript(image=>{
    navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=480;c.height=640;const ctx=c.getContext('2d'),img=new Image();img.src=image;await img.decode();window.showFixture=true;
     const draw=()=>{ctx.fillStyle='#222';ctx.fillRect(0,0,c.width,c.height);if(window.showFixture){const k=Math.min(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*k)/2,(c.height-img.height*k)/2,img.width*k,img.height*k);}};
     draw();setInterval(draw,100);return c.captureStream(10);};
   },image);
  }
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:62455/');await page.locator('#camera-button').click();
  await page.waitForFunction(()=>poniDiagnostics().cameraFrames>=3,null,{timeout:60000});
  if(process.env.FACE_FIXTURE){
   await page.waitForFunction(()=>poniDiagnostics().faceDetected);console.log('PASS: real CPU model detects a portrait face in the complete portrait frame.');
   await page.locator('#immersive-button').click();const before=await page.evaluate(()=>poniDiagnostics().cameraFrames);await page.waitForFunction(n=>poniDiagnostics().cameraFrames>n+3,before);await page.locator('#immersive-exit').click();
   await page.evaluate(()=>window.showFixture=false);await page.waitForFunction(()=>!poniDiagnostics().faceDetected);console.log('PASS: fullscreen frames continue; blank frame clears the face.');
  }
  console.log('PASS: real MediaPipe CPU model processed video.',await page.locator('#vision-detail').innerText());if(errors.length)throw Error(errors.join(';'));
  await page.locator('#camera-button').click();if(await page.evaluate(()=>poniDiagnostics().cameraActive))throw Error('Camera did not stop');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
