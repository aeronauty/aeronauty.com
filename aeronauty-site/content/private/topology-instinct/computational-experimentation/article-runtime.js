const progress=document.querySelector('.ce-progress');
const updateProgress=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.style.transform='scaleX('+(max>0?scrollY/max:0)+')'};
addEventListener('scroll',updateProgress,{passive:true});updateProgress();
document.querySelectorAll('.ce-aside-mark').forEach(mark=>mark.addEventListener('click',event=>{event.preventDefault();const aside=mark.closest('.ce-aside');const open=!aside.classList.contains('open');document.querySelectorAll('.ce-aside.open').forEach(item=>item.classList.remove('open'));aside.classList.toggle('open',open);mark.setAttribute('aria-expanded',String(open));}));
document.addEventListener('click',event=>{if(!event.target.closest('.ce-aside'))document.querySelectorAll('.ce-aside.open').forEach(item=>item.classList.remove('open'))});
const links=[...document.querySelectorAll('[data-map-link]')];const sections=[...document.querySelectorAll('[data-section]')];
const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;links.forEach(link=>link.classList.toggle('active',link.dataset.mapLink===visible.target.dataset.section));},{rootMargin:'-30% 0px -55%',threshold:[0,.15,.4]});sections.forEach(section=>observer.observe(section));
