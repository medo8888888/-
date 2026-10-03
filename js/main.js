(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const hd=$('header'),burger=$('.burger'),nav=$('nav.main');
// header behaviour
let last=0;
const onScroll=()=>{
  const y=scrollY;
  hd.classList.toggle('solid',y>30);
  hd.classList.toggle('hide',y>last&&y>400&&!nav.classList.contains('open'));
  last=y;
  $('.totop').classList.toggle('show',y>600);
  const tl=$('.timeline');
  if(tl){const r=tl.getBoundingClientRect(),h=innerHeight;
    const p=Math.min(Math.max((h*.6-r.top)/r.height,0),1);$('.fill',tl).style.height=p*100+'%'}
};
addEventListener('scroll',onScroll,{passive:true});onScroll();
burger.onclick=()=>{burger.classList.toggle('open');nav.classList.toggle('open');burger.setAttribute('aria-expanded',nav.classList.contains('open'))};
$$('nav.main a').forEach(a=>a.addEventListener('click',()=>{burger.classList.remove('open');nav.classList.remove('open')}));
$('.totop').onclick=()=>scrollTo({top:0});
// reveal on scroll
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
$$('.rv,.tl').forEach(el=>io.observe(el));
// stagger children of grids
$$('.grid').forEach(g=>$$(':scope>.rv',g).forEach((c,i)=>c.style.setProperty('--d',i*.08+'s')));
// counters
const co=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;co.unobserve(e.target);
  const el=e.target,to=+el.dataset.to,t0=performance.now();
  const f=t=>{const p=Math.min((t-t0)/1600,1);el.textContent=Math.round(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)}),{threshold:.6});
$$('[data-to]').forEach(el=>co.observe(el));
// falling leaves in hero
const hero=$('.hero:not(.small)');
if(hero&&!matchMedia('(prefers-reduced-motion:reduce)').matches)
  for(let i=0;i<9;i++){const l=document.createElement('span');l.className='leaf';l.textContent=i%2?'🍃':'🍂';
    l.style.cssText=`inset-inline-start:${Math.random()*100}%;animation-duration:${10+Math.random()*12}s;animation-delay:${-Math.random()*20}s;font-size:${18+Math.random()*18}px`;hero.append(l)}
// FAQ tabs
$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.setAttribute('aria-selected',x===t));
  $$('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==t.dataset.t)});
// page transition
$$('a[href]').forEach(a=>{const h=a.getAttribute('href');
  if(!h||h[0]==='#'||/^(https?:|mailto:|tel:)/.test(h)||a.target)return;
  a.addEventListener('click',e=>{e.preventDefault();document.body.classList.add('leaving');setTimeout(()=>location.href=h,230)})});
addEventListener('pageshow',e=>{if(e.persisted)document.body.classList.remove('leaving')});
})();
