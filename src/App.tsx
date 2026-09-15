import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import maplibregl, { Map, Marker, NavigationControl } from 'maplibre-gl'

type Lang = 'az'|'en'|'ru'
type District = {id:string;name:Record<Lang,string>;center:[number,number]}
type Rental = {id:string;district:string;title:Record<Lang,string>;rooms:number;area:number;rent:number;source:string}

const districts: District[] = [
  {id:'sabail',name:{az:'Səbail',en:'Sabail',ru:'Сабаиль'},center:[49.83,40.35]},
  {id:'yasamal',name:{az:'Yasamal',en:'Yasamal',ru:'Ясамал'},center:[49.803,40.386]},
  {id:'nasimi',name:{az:'Nəsimi',en:'Nasimi',ru:'Насими'},center:[49.928,40.415]},
  {id:'narimanov',name:{az:'Nərimanov',en:'Narimanov',ru:'Нариманов'},center:[49.861,40.407]},
  {id:'khatai',name:{az:'Xətai',en:'Khatai',ru:'Хатаи'},center:[49.905,40.379]},
  {id:'nizami',name:{az:'Nizami',en:'Nizami',ru:'Низами'},center:[49.839,40.388]},
]

const rentals: Rental[] = [
  {id:'qarayev',district:'nizami',title:{az:'7 otaqlı villa · 218 m²',en:'7-room villa · 218 m²',ru:'7-комнатная вилла · 218 м²'},rooms:7,area:218,rent:2000,source:'https://bina.az/items/6433390'},
  {id:'may-house',district:'nasimi',title:{az:'2 otaqlı həyət evi · 90 m²',en:'2-room private house · 90 m²',ru:'2-комнатный частный дом · 90 м²'},rooms:2,area:90,rent:850,source:'https://bina.az/items/6392477'},
  {id:'courtyard',district:'nasimi',title:{az:'2 otaqlı həyət evi · 40 m²',en:'2-room courtyard home · 40 m²',ru:'2-комнатный дворовый дом · 40 м²'},rooms:2,area:40,rent:700,source:'https://bina.az/items/6441612'},
]

const ui = {
 az:{open:'Xəritəni aç',rent:'Kirayə elanları',title:'Bakıda evi xəritədən tap.',lead:'Əvvəl rayonu hiss et, sonra evi seç.',skip:'Keç',map:'Bakı xəritəsi',close:'Bağla',all:'Bütün rayonlar',month:'/ ay',source:'Elanı aç',saved:'Seçilmişlər'},
 en:{open:'Open map',rent:'Rental listings',title:'Find your Baku home from the map.',lead:'Feel the district first, then choose the home.',skip:'Skip',map:'Baku map',close:'Close',all:'All districts',month:'/ mo',source:'Open listing',saved:'Saved'},
 ru:{open:'Открыть карту',rent:'Аренда',title:'Найди свой дом в Баку через карту.',lead:'Сначала почувствуй район, потом выбирай жильё.',skip:'Пропустить',map:'Карта Баку',close:'Закрыть',all:'Все районы',month:'/ мес',source:'Открыть объявление',saved:'Избранное'}
}

function MapExperience({lang,onClose,onCatalog}:{lang:Lang;onClose:()=>void;onCatalog:()=>void}){
 const node=useRef<HTMLDivElement|null>(null); const mapRef=useRef<Map|null>(null); const [selected,setSelected]=useState<string|null>(null); const t=ui[lang]
 useEffect(()=>{ if(!node.current||mapRef.current)return; const map=new maplibregl.Map({container:node.current,style:'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',center:[49.867,40.389],zoom:11.3,pitch:42,bearing:-12}); map.addControl(new NavigationControl(),'bottom-right'); mapRef.current=map; const ms:Marker[]=[]; districts.forEach(d=>{const el=document.createElement('button');el.className='district-marker';el.textContent=d.name[lang];el.onclick=()=>{setSelected(d.id);map.flyTo({center:d.center,zoom:13.4,pitch:48,duration:1200})};ms.push(new Marker({element:el}).setLngLat(d.center).addTo(map))}); return()=>{ms.forEach(m=>m.remove());map.remove();mapRef.current=null}},[lang])
 return <motion.section className="map-screen" initial={{opacity:0,scale:1.04,clipPath:'circle(5% at 50% 50%)'}} animate={{opacity:1,scale:1,clipPath:'circle(100% at 50% 50%)'}} exit={{opacity:0,scale:.985}} transition={{duration:.8,ease:[.22,1,.36,1]}}><div ref={node} className="map-canvas"/><div className="map-ui"><div className="map-top"><div className="logo light">ev<span>.</span></div><button onClick={onClose}>{t.close} ×</button></div><aside className="map-panel"><span className="eyebrow">IMMERSIVE RENTAL MAP</span><h2>{t.map}</h2><div className="district-list">{districts.map(d=><button key={d.id} className={selected===d.id?'active':''} onClick={()=>{setSelected(d.id);mapRef.current?.flyTo({center:d.center,zoom:13.4,pitch:48,duration:1200})}}><i/> {d.name[lang]}</button>)}</div><button className="primary" onClick={onCatalog}>{t.rent} →</button></aside></div></motion.section>
}

function App(){
 const initial=(localStorage.getItem('ev-lang') as Lang)||'az'; const [lang,setLang]=useState<Lang>(initial); const [overlay,setOverlay]=useState<'onboarding'|'map'|null>('onboarding'); const [district,setDistrict]=useState('all'); const [saved,setSaved]=useState<string[]>(()=>JSON.parse(localStorage.getItem('ev-saved')||'[]')); const t=ui[lang]
 useEffect(()=>{localStorage.setItem('ev-lang',lang);document.documentElement.lang=lang},[lang]); useEffect(()=>{localStorage.setItem('ev-saved',JSON.stringify(saved))},[saved]);
 const visible=useMemo(()=>rentals.filter(r=>district==='all'||r.district===district),[district]);
 const openCatalog=()=>{setOverlay(null);setTimeout(()=>document.querySelector('#rentals')?.scrollIntoView({behavior:'smooth'}),50)}
 return <>
  <header><a className="brand" href="#top"><div className="logo">ev<span>.</span></div><b>Baku rental discovery</b></a><nav><button onClick={()=>setOverlay('map')}>{t.map}</button><a href="#rentals">{t.rent}</a></nav><div className="langs">{(['az','en','ru'] as Lang[]).map(x=><button key={x} className={lang===x?'active':''} onClick={()=>setLang(x)}>{x.toUpperCase()}</button>)}</div></header>
  <main id="top"><section className="hero"><div><span className="eyebrow">BAKU · RENTAL DISCOVERY</span><h1>{t.title}</h1><p>{t.lead}</p><div className="actions"><button className="primary" onClick={()=>setOverlay('map')}>{t.open} ↗</button><a className="secondary" href="#rentals">{t.rent}</a></div></div><button className="hero-card" onClick={()=>setOverlay('map')}><span>40.4093° N · 49.8671° E</span><strong>{t.map}</strong><small>MapLibre GL · 3D pitch · district focus</small></button></section>
  <section id="rentals" className="catalog"><div className="section-head"><div><span className="eyebrow">RENTAL-FIRST</span><h2>{t.rent}</h2></div><button onClick={()=>setOverlay('map')}>{t.open} ↗</button></div><select value={district} onChange={e=>setDistrict(e.target.value)}><option value="all">{t.all}</option>{districts.map(d=><option key={d.id} value={d.id}>{d.name[lang]}</option>)}</select><div className="grid">{visible.map(r=><article key={r.id}><div className="card-art">{districts.find(d=>d.id===r.district)?.name[lang]}<button onClick={()=>setSaved(s=>s.includes(r.id)?s.filter(x=>x!==r.id):[...s,r.id])}>{saved.includes(r.id)?'♥':'♡'}</button></div><div className="card-body"><div className="price">{r.rent.toLocaleString()} ₼ <small>{t.month}</small></div><h3>{r.title[lang]}</h3><p>{r.rooms} rooms · {r.area} m²</p><a href={r.source} target="_blank" rel="noreferrer">{t.source} ↗</a></div></article>)}</div></section></main>
  <AnimatePresence mode="wait">{overlay==='onboarding'&&<motion.section className="onboarding" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,scale:1.03,filter:'blur(12px)'}} transition={{duration:.6}}><div className="onboard-copy"><div className="onboard-top"><div className="logo light">ev<span>.</span></div><div className="langs dark">{(['az','en','ru'] as Lang[]).map(x=><button key={x} className={lang===x?'active':''} onClick={()=>setLang(x)}>{x.toUpperCase()}</button>)}</div></div><div><span className="eyebrow light-text">BAKU · RENTAL DISCOVERY</span><h1>{t.title}</h1><p>{t.lead}</p><div className="actions"><button className="primary orange" onClick={()=>setOverlay('map')}>{t.open} ↗</button><button className="ghost" onClick={openCatalog}>{t.rent}</button></div></div><button className="skip" onClick={()=>setOverlay('map')}>{t.skip} →</button></div><div className="onboard-visual"><div><span>CASPIAN SEA</span><strong>BAKU</strong><small>Explore districts before listings</small></div></div></motion.section>}{overlay==='map'&&<MapExperience lang={lang} onClose={()=>setOverlay(null)} onCatalog={openCatalog}/>}</AnimatePresence>
 </>
}
export default App
