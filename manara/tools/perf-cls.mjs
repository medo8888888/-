// MANARA - layout-shift (CLS) and load timing per page, 390 and 1440 px, motion on.   node manara/tools/perf-cls.mjs   (Good CLS is < 0.1; every page must stay below it)
import { launch, openPage, url } from './lib.mjs';
const b = await launch();
for (const pg of ['index','mission','detect','alert','build','pitch','report','poster','404']) for (const w of [390,1440]) {
  const ctx = await b.newContext({viewport:{width:w,height:w>600?900:844},isMobile:w<600,hasTouch:w<600,reducedMotion:'no-preference',colorScheme:'dark'});
  await ctx.addInitScript(()=>{ window.__cls=0; window.__shifts=[]; new PerformanceObserver(l=>{for(const e of l.getEntries()){ if(!e.hadRecentInput){window.__cls+=e.value; window.__shifts.push([Math.round(e.startTime),+e.value.toFixed(4),(e.sources||[]).map(s=>s.node&&(s.node.id||s.node.className||s.node.nodeName)).slice(0,2).join('/')])}}}).observe({type:'layout-shift',buffered:true}); });
  const page = await ctx.newPage(); await page.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.abort());
  const t0=Date.now(); await page.goto(url(pg+'.html'),{waitUntil:'load'}); const load=Date.now()-t0;
  await page.waitForTimeout(2500);
  const r = await page.evaluate(()=>({cls:+window.__cls.toFixed(4), shifts:window.__shifts.slice(0,3), fcp:(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime}));
  console.log(pg.padEnd(8),w,'load',load+'ms','CLS',r.cls,'fcp',Math.round(r.fcp||0),JSON.stringify(r.shifts));
  await ctx.close();
}
await b.close();
