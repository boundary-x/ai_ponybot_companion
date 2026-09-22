const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');const path=require('node:path');require('node:fs').mkdirSync(path.resolve(__dirname,'../.test-results'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},permissions:['microphone','camera']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.packets=[];const device=new EventTarget();device.name='BBC micro:bit [ponii]';device.gatt={connected:false,connect:async()=>{device.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>({writeValueWithResponse:async bytes=>{window.packets.push(new TextDecoder().decode(bytes));}})})};},disconnect(){device.gatt.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
   Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>device}});
 });
 let mode='ok',requestBody,requestCount=0,releaseDelayed,heard='안녕 포니야';
 const plan={emotion:'happy',sound:'none',caption:'같이 있으니 좋아요',heard:'',intensity:.6,motions:[{motors:[25,25,-25,-25],ms:150},{motors:[-25,-25,25,25],ms:150}]};
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   requestCount++;requestBody=route.request().postDataJSON();
   if(mode==='delay')await new Promise(r=>releaseDelayed=r);
   if(mode==='error'){await route.fulfill({status:429,contentType:'application/json',body:'{"error":{}}'});return;}
   const response=structuredClone(plan);if(mode==='invalid')response.motions[0].motors[0]=999;
   if(requestBody.contents[0].parts.some(p=>p.inlineData?.mimeType==='audio/wav'))response.heard=heard;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{functionCall:{name:'express',args:response}}]}}]})}).catch(()=>{});
 });
 // Browser integration test: deterministic face detection. Real-model smoke test is separate.
 await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export const FilesetResolver={forVisionTasks:async()=>({})};export const FaceDetector={createFromOptions:async()=>({detectForVideo:()=>({detections:window.noFace?[]:[{boundingBox:window.faceTestBox||{originX:340,originY:80,width:80,height:90},categories:[{score:.95}]}]}),close(){}})};'}));
 await page.route('https://storage.googleapis.com/mediapipe-models/**',route=>route.fulfill({body:Buffer.from([0])}));
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:62455/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.poniDiagnostics==='function');
 assert.equal(await page.locator('.expression-button').count(),6);
 await page.screenshot({path:path.resolve(__dirname,'../.test-results/poni-desktop.png'),fullPage:true});
 await page.locator('[data-reaction=tickle]').click();assert.equal(await page.locator('#face-state').innerText(),'애정');
 await page.locator('#message').fill('안녕 포니야');await page.locator('#message-form button').click();assert.equal(await page.locator('#face-state').innerText(),'기쁨');assert.equal(requestCount,0);
 await page.locator('#connect-button').click();await page.waitForFunction(()=>poniDiagnostics().bluetoothConnected);assert.equal(await page.locator('#motion-toggle').isChecked(),false);
 await page.locator('#motion-toggle').check();await page.locator('[data-reaction=greet]').click();await page.waitForFunction(()=>packets.some(p=>p.startsWith('M')));
 await page.locator('#stop-button').click();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>packets.at(-1)),'S\n');assert.equal(await page.locator('#motion-toggle').isChecked(),false);
 await page.locator('#ai-button').click();await page.locator('#api-key').fill('test-key-not-a-secret');await page.locator('#ai-save').click();await page.waitForFunction(()=>poniDiagnostics().aiConnected&&!document.getElementById('ai-dialog').open);
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(requestBody.tools[0].functionDeclarations[0].name,'express');
 await page.locator('#motion-toggle').check();await page.locator('#message').fill('나랑 놀자');await page.locator('#message-form button').click();await page.waitForFunction(()=>!poniDiagnostics().busy&&poniDiagnostics().emotion==='happy');
 assert.equal(JSON.parse(requestBody.contents[0].parts[0].text).context.motorsEnabled,true);
 mode='delay';await page.locator('#message').fill('움직여줘');await page.locator('#message-form button').click();await page.waitForFunction(()=>poniDiagnostics().busy);await page.locator('#stop-button').click();const count=await page.evaluate(()=>packets.filter(p=>p.startsWith('M')).length);releaseDelayed();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>packets.filter(p=>p.startsWith('M')).length),count);assert.equal(await page.locator('#face-state').innerText(),'편안함');
 mode='invalid';await page.locator('#message').fill('다시 놀자');await page.locator('#message-form button').click();await page.waitForFunction(()=>!poniDiagnostics().busy);assert.match(await page.locator('#notice').innerText(),/허용 범위/);assert.equal(await page.evaluate(()=>packets.filter(p=>p.startsWith('M')).length),count);
 mode='error';await page.locator('#message').fill('안녕');await page.locator('#message-form button').click();await page.waitForFunction(()=>!poniDiagnostics().busy);assert.match(await page.locator('#notice').innerText(),/한도|사용량/);
 mode='ok';await page.locator('#camera-button').click();await page.waitForFunction(()=>poniDiagnostics().cameraActive);assert.equal(await page.locator('#camera-preview').isVisible(),true);
 const requestBefore=requestCount;
 await page.locator('#talk-button').scrollIntoViewIfNeeded();const talk=await page.locator('#talk-button').boundingBox();await page.mouse.move(talk.x+20,talk.y+20);await page.mouse.down();await page.waitForFunction(()=>poniDiagnostics().recording);await page.waitForTimeout(550);await page.mouse.up();await page.waitForFunction(()=>!poniDiagnostics().busy&&!poniDiagnostics().recording);assert(requestCount>requestBefore);assert(requestBody.contents[0].parts.some(p=>p.inlineData?.mimeType==='audio/wav'));assert.equal(requestBody.contents[0].parts.some(p=>p.inlineData?.mimeType==='image/jpeg'),false);

 // A voice direction overrides the AI's arbitrary expressive steps.
 await page.locator('#motion-toggle').check();heard='앞으로 움직여줘';
 await page.locator('#talk-button').scrollIntoViewIfNeeded();const t2=await page.locator('#talk-button').boundingBox();await page.mouse.move(t2.x+20,t2.y+20);await page.mouse.down();await page.waitForFunction(()=>poniDiagnostics().recording);await page.waitForTimeout(550);await page.mouse.up();
 await page.waitForFunction(()=>packets.includes('M+45+45+45+45T400\n'));
 assert.match(await page.locator('#heard-text').innerText(),/앞으로 움직여줘/);assert.match(await page.locator('#chosen-action').innerText(),/앞으로/);
 await page.waitForFunction(()=>poniDiagnostics().motionOwner==='tracking');
 assert.equal(await page.locator('#face-box').isVisible(),true);assert.match(await page.locator('#tracking-hint').innerText(),/오른쪽/);
 await page.evaluate(()=>window.noFace=true);await page.waitForFunction(()=>!poniDiagnostics().faceDetected&&packets.at(-1)==='S\n');
 const noFaceCount=await page.evaluate(()=>packets.length);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>packets.length),noFaceCount);
 await page.evaluate(()=>{window.noFace=false;window.faceTestBox={originX:200,originY:80,width:80,height:90};});await page.waitForFunction(()=>poniDiagnostics().faceDetected);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>poniDiagnostics().motionOwner),null);
 await page.evaluate(()=>window.faceTestBox={originX:340,originY:80,width:80,height:90});await page.waitForFunction(()=>poniDiagnostics().motionOwner==='tracking');
 await page.locator('#stop-button').click();const stoppedCount=await page.evaluate(()=>packets.length);await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>packets.length),stoppedCount);assert.equal(await page.locator('#motion-toggle').isChecked(),false);
 await page.locator('#message').fill('앞으로');await page.locator('#message-form button').click();assert.match(await page.locator('#move-status').innerText(),/몸짓/);assert.match(await page.locator('#chosen-action').innerText(),/앞으로/);
 for(const size of [{width:1440,height:1100},{width:1280,height:800},{width:768,height:1024},{width:393,height:852},{width:320,height:740},{width:852,height:393}]){
   await page.setViewportSize(size);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify(size));
   await page.locator('#immersive-button').click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('immersive')),true);assert.equal(await page.locator('#camera-preview').evaluate(e=>e.parentElement.id),'face-stage');assert.equal(await page.locator('#camera-preview').isVisible(),true);const rect=await page.locator('#face-stage').boundingBox();assert(Math.abs(rect.width-size.width)<2);await page.locator('#immersive-exit').click();assert.equal(await page.locator('#camera-preview').evaluate(e=>e.parentElement.id),'camera-anchor');
   await page.locator('#ai-button').click();const dlg=await page.locator('#ai-dialog').boundingBox();assert(dlg.x>=0&&dlg.x+dlg.width<=size.width);await page.locator('.close-button').click();
 }
 await page.setViewportSize({width:393,height:852});await page.locator('#camera-button').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.resolve(__dirname,'../.test-results/poni-mobile.png'),fullPage:true});
 await page.route('https://storage.googleapis.com/mediapipe-models/**',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.locator('#camera-button').click();await page.waitForFunction(()=>document.getElementById('vision-detail').dataset.state==='error');assert.match(await page.locator('#vision-detail').innerText(),/503/);
 assert.deepEqual(errors,[]);console.log('PASS: layouts (6 sizes), original expressions, basic input, BLE motor/stop, AI success/error/invalid/stale response, no key persistence, camera integration, real mic WAV upload, full-face mode.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
