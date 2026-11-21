(()=>{'use strict';
const BRANDS=[
 {id:'care16',name:'Care16',logo:'assets/care16.png',tag:'NATURAL CARE & WELLNESS',summary:'일상의 섬세한 케어를 위한 컬렉션'},
 {id:'whang',name:'WHANG BIN COSMEDI',logo:'assets/whang-bin-cosmedi.png',tag:'BEAUTY & COSMETICS',summary:'감각적인 아름다움의 새로운 제안'},
 {id:'hans',name:'HANS LaBelle',logo:'assets/hans-labelle.png',tag:'PREMIUM BEAUTY',summary:'품격 있는 뷰티 라이프스타일'}
];
const STORE_KEY='modu_global_products_v4',OLD_KEY='modu_global_products_v3',CART_KEY='modu_global_cart_v4';
const app=document.getElementById('app');const siteTitle=document.title;const memory={};let orderQty=1;let currentImage=0;
const hosted=Boolean(document.querySelector('meta[name="modu-shop-server"]'));
let remoteCatalog={products:[]};
let remotePayments={};
const paymentAvailable=()=>Object.values(remotePayments).some(Boolean);
async function shopApi(path,{method='GET',body}={}){
 const request={method};
 if(body!==undefined){
  request.headers={'Content-Type':'application/json'};
  request.body=JSON.stringify(body);
 }
 const response=await fetch(path,request);
 const result=await response.json();
 if(!response.ok){
  const error=new Error(result.error||'서버 요청을 처리할 수 없습니다.');
  error.status=response.status;
  throw error;
 }
 return result;
}
async function refreshShop(){
 const catalog=await shopApi('/api/catalog');
 remoteCatalog=catalog;
 remotePayments=catalog.payments;
}
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getValue=k=>{try{return memory[k]??localStorage.getItem(k)}catch{return null}};
function putValue(key,value){
 try{
  localStorage.setItem(key,value);
  delete memory[key];
  return true;
 }catch(error){
  if(error.name!=='SecurityError'&&error.name!=='InvalidStateError')throw error;
  memory[key]=value;
  return false;
 }
}
const currency=n=>Number(n).toLocaleString('ko-KR')+'원';
const brand=id=>BRANDS.find(b=>b.id===id)||null;
const byId=id=>getProducts().find(p=>p.id===id)||null;
const productLink=id=>'#/product/'+encodeURIComponent(id);
const brandLink=id=>'#/brand/'+id;
const registerLink=id=>'#/admin/brand/'+id;
const recommendedFirst=(a,b)=>Number(b.featured)-Number(a.featured)||b.createdAt-a.createdAt;
const sampleProducts=[
 {id:'demo-care-1',brand:'care16',name:'CARE16 브랜드 상품 예시 01',category:'뷰티 · 케어',price:39000,originalPrice:45000,stock:30,desc:'이 상품은 상세페이지의 구성을 보여주기 위한 시연용 데이터입니다.\n실제 판매 상품명·가격·성분·배송정보는 관리자에서 직접 등록하세요.',images:[],featured:true,visible:true,sample:true,createdAt:1},
 {id:'demo-care-2',brand:'care16',name:'CARE16 브랜드 상품 예시 02',category:'라이프스타일',price:29000,originalPrice:0,stock:18,desc:'화면 테스트용 샘플 상품입니다. 실제 상품을 등록할 때 사진, 가격 및 상품 설명을 변경하세요.',images:[],featured:true,visible:true,sample:true,createdAt:2},
 {id:'demo-whang-1',brand:'whang',name:'WHANG BIN COSMEDI 상품 예시 01',category:'스킨케어',price:58000,originalPrice:0,stock:14,desc:'WHANG BIN COSMEDI의 실제 상품이 아닌 시연용 샘플입니다.\n관리자에서 정식 판매 정보로 교체해 주세요.',images:[],featured:true,visible:true,sample:true,createdAt:3},
 {id:'demo-whang-2',brand:'whang',name:'WHANG BIN COSMEDI 상품 예시 02',category:'코스메틱',price:42000,originalPrice:50000,stock:9,desc:'이 상품은 디자인 시연용입니다. 실제 판매 상품으로 간주하지 마세요.',images:[],featured:false,visible:true,sample:true,createdAt:4},
 {id:'demo-hans-1',brand:'hans',name:'HANS LaBelle 상품 예시 01',category:'프리미엄 뷰티',price:64000,originalPrice:0,stock:25,desc:'HANS LaBelle의 실제 상품이 아닌 테스트용 샘플 상품입니다.',images:[],featured:true,visible:true,sample:true,createdAt:5},
 {id:'demo-hans-2',brand:'hans',name:'HANS LaBelle 상품 예시 02',category:'뷰티',price:34000,originalPrice:0,stock:33,desc:'관리자에서 샘플을 삭제하거나 실상품 정보로 교체할 수 있습니다.',images:[],featured:false,visible:true,sample:true,createdAt:6}
];
function cleanProduct(p){return {...p,id:String(p.id??''),name:String(p.name??''),brand:p.brand==='meicell'?'whang':p.brand,images:Array.isArray(p.images)?p.images:(p.image?[p.image]:[]),visible:p.visible!==false,featured:!!p.featured,sample:!!p.sample,price:Number(p.price)||0,originalPrice:Number(p.originalPrice)||0,stock:Math.max(0,Number(p.stock)||0),createdAt:Number(p.createdAt)||Date.now()}}
function getProducts(){if(hosted)return remoteCatalog.products;let raw=getValue(STORE_KEY);if(raw!==null){try{let list=JSON.parse(raw);return Array.isArray(list)?list.map(cleanProduct):[]}catch{return []}}
 let old=getValue(OLD_KEY);if(old){try{const p=JSON.parse(old);if(Array.isArray(p)&&p.length){const items=p.map(cleanProduct);putValue(STORE_KEY,JSON.stringify(items));return items}}catch{}}
 putValue(STORE_KEY,JSON.stringify(sampleProducts));return sampleProducts.map(cleanProduct)}
async function saveProducts(items){
 if(!hosted)return putValue(STORE_KEY,JSON.stringify(items));
 remoteCatalog=await shopApi('/api/admin/catalog',{method:'PUT',body:{products:items,revision:remoteCatalog.revision}});
 return true;
}
function getCart(){try{const j=JSON.parse(getValue(CART_KEY)||'[]');return Array.isArray(j)?j.map(item=>({...item,id:String(item.id)})):[]}catch{return []}}
function saveCart(cart){putValue(CART_KEY,JSON.stringify(cart));updateCartCount()}
function updateCartCount(){const el=document.getElementById('cartCount');if(el)el.textContent=getCart().reduce((s,item)=>s+item.quantity,0)}
function logoHTML(b){return `<img src="${escapeHtml(b.logo)}" alt="${escapeHtml(b.name)} 로고">`}
function brandCard(b){return `<a class="brand-card" href="${brandLink(b.id)}" aria-label="${escapeHtml(b.name)} 상품 보기"><div class="brand-art ${b.id}">${logoHTML(b)}</div><div class="brand-footer"><span>${escapeHtml(b.name)}</span><span aria-hidden="true">↗</span></div></a>`}
function brandGrid(){return `<div class="brand-grid">${BRANDS.map(brandCard).join('')}</div>`}
function placeholderProduct(p){return `<div class="placeholder-product ${escapeHtml(p.brand)}"><div class="mock-bottle" aria-hidden="true"></div><small>${escapeHtml(brand(p.brand)?.name||'MODU GLOBAL')}</small></div>`}
function cover(p){return p.images?.length?`<img loading="lazy" src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)} 상품 이미지">`:placeholderProduct(p)}
function productCard(p){
 return `<a href="${productLink(p.id)}" class="product-card">
  <div class="product-image">${cover(p)}${p.sample?'<span class="product-label">시연용 샘플</span>':''}</div>
  <div class="product-info">
   <p class="product-brand">${escapeHtml(brand(p.brand)?.name||'')}</p>
   <h3 class="product-name">${escapeHtml(p.name)}</h3>
   <p class="product-price">${currency(p.price)}${p.originalPrice>p.price?`<span class="compare-price">${currency(p.originalPrice)}</span>`:''}</p>
   ${p.stock<=0?'<div class="status-word">품절</div>':''}
   <span class="product-detail-link" aria-hidden="true">상세 보기 ↗</span>
  </div>
 </a>`;
}
function productGrid(products,selectedBrand=null){
 if(products.length)return `<div class="product-grid">${products.map(productCard).join('')}</div>`;
 const url=selectedBrand?registerLink(selectedBrand.id):'#/admin';
 return `<div class="empty-state"><strong>등록된 공개 상품이 없습니다</strong>
  <a class="button-outline" href="${url}">상품 등록하기 ↗</a>
 </div>`;
}
function activeProducts(){return getProducts().filter(p=>p.visible && brand(p.brand))}
function pageHero(kicker,title,desc){return `<section class="page-hero"><span class="small-caps">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(desc)}</p></section>`}
function home(){const recent=activeProducts().sort(recommendedFirst).slice(0,8);
 app.innerHTML=`<section class="hero"><div class="hero-inner"><span class="small-caps">MODU GLOBAL · SIGNATURE EDITION</span><div class="hero-line"></div><h1>취향을 발견하는<br>새로운 기준</h1><p>일상에 머무는 아름다운 가치.<br>다채로운 브랜드와 특별한 순간을 만나는 곳.</p><a href="#/brands" class="button-light">브랜드 컬렉션 보기 &nbsp; ↗</a></div><div class="hero-counter"><span>01</span><i></i><span>03</span><small>THE MODU EDITION</small></div></section>
 <section class="feature-strip"><div class="feature-inner"><div><strong>CURATED BRANDS</strong><span>엄선된 브랜드의 특별한 제안</span></div><div><strong>INSPIRED LIVING</strong><span>취향과 일상을 위한 새로운 발견</span></div><div><strong>MODU GLOBAL</strong><span>다양한 가치를 하나의 공간에</span></div></div></section>
 <section class="section" id="brands"><div class="section-top"><div><span class="section-kicker">EXPLORE OUR PARTNERS</span><h2 class="section-title">SHOP BY BRAND</h2><p class="section-caption">각 브랜드의 개성을 담은 컬렉션을 만나보세요.</p></div><a class="text-link" href="#/brands">VIEW ALL BRANDS ↗</a></div>${brandGrid()}</section>
 <div class="section-cream"><section class="section"><div class="section-top"><div><span class="section-kicker">EXCLUSIVELY SELECTED</span><h2 class="section-title">CURATED SELECTION</h2><p class="section-caption">브랜드별 상품을 둘러보세요. 현재 등록된 샘플은 시연용입니다.</p></div><a class="text-link" href="#/all">VIEW ALL PRODUCTS ↗</a></div>${productGrid(recent)}</section></div>
 <section class="editorial"><div class="editorial-inner"><span class="small-caps" style="color:#aebcce">WELCOME TO MODU GLOBAL</span><h2>품격을 더하고, 취향을 발견하다</h2><p>라이프스타일을 풍요롭게 만드는 브랜드들을 한곳에 모았습니다. 당신의 일상을 위한 더 좋은 선택, 모두글로벌.</p><a href="#/brands" class="button-outline">브랜드 둘러보기 ↗</a></div></section>`}
function brandsPage(){app.innerHTML=pageHero('EXPLORE THE COLLECTION','SHOP BY BRAND','좋은 브랜드와 특별한 만남')+`<section class="section">${brandGrid()}<p class="demo-note" style="margin-top:34px">브랜드 로고는 제공된 이미지를 바탕으로 투명 배경 형태로 적용했습니다. WHANG BIN COSMEDI는 제공된 로고의 영문을 유지합니다.</p></section>`}
function listingPage(id,query=''){let all=activeProducts(),b=brand(id);if(id!=='all'&&!b){notFound();return}
 let filtered=id==='all'?all:all.filter(p=>p.brand===id);
 if(query){let t=query.toLocaleLowerCase();filtered=all.filter(p=>[p.name,p.category,brand(p.brand)?.name,p.desc].some(x=>String(x??'').toLocaleLowerCase().includes(t)))}
 const title=query?'검색 결과':id==='all'?'ALL PRODUCTS':b.name;const kicker=query?'SEARCH':id==='all'?'DISCOVER MORE':b.tag;const summary=query?`“${query}” 검색 결과입니다.`:id==='all'?'모두글로벌의 전체 상품을 만나보세요.':b.summary;
 const results=query&&!filtered.length
  ? '<div class="empty-state"><strong>검색 조건에 맞는 상품이 없습니다</strong><a href="#/all" class="button-outline">전체 상품 보기</a></div>'
  : productGrid(filtered.sort(recommendedFirst),b);
 app.innerHTML=pageHero(kicker,title,summary)+`<section class="section"><div class="crumb"><a href="#/">홈</a> / <a href="#/brands">브랜드</a> / ${escapeHtml(title)}</div><div class="listing-toolbar"><span>총 <b>${filtered.length}</b>개 상품${filtered.some(p=>p.sample)?' · 샘플 상품 포함':''}</span><select class="select" id="sortProducts" aria-label="상품 정렬" ${filtered.length?'':'disabled'}><option value="recent">추천·최신순</option><option value="low">낮은 가격순</option><option value="high">높은 가격순</option><option value="name">상품명순</option></select></div><div id="listingResults">${results}</div></section>`;
 const sorters={
  recent:recommendedFirst,
  low:(a,b)=>a.price-b.price,
  high:(a,b)=>b.price-a.price,
  name:(a,b)=>a.name.localeCompare(b.name,'ko')
 };
 const select=document.getElementById('sortProducts');
 select.onchange=()=>{
  document.getElementById('listingResults').innerHTML=productGrid(filtered.slice().sort(sorters[select.value]),b);
 };
}
function detailPage(id){
 const p=byId(id);
 const selectedBrand=p&&brand(p.brand);
 if(!p?.visible||!selectedBrand){notFound();return}
 const returnLink=brandLink(selectedBrand.id);
 document.title=p.name+' | '+siteTitle;
 orderQty=1;
 currentImage=0;
 let pic=p.images?.length?`<img id="detailMainImage" src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)}">`:placeholderProduct(p);
 const thumbs=p.images?.length>1?`<div class="thumbs">${p.images.map((img,i)=>`<button class="thumb ${i===0?'active':''}" data-thumb="${i}" aria-label="상품 사진 ${i+1}"><img src="${escapeHtml(img)}" alt="상품 사진 ${i+1}"></button>`).join('')}</div>`:'';
 const related=activeProducts().filter(x=>x.brand===p.brand&&x.id!==p.id).slice(0,4);
 app.innerHTML=`<section class="section"><div class="crumb"><a href="#/">홈</a> / <a href="${returnLink}">${escapeHtml(selectedBrand.name)}</a> / ${escapeHtml(p.name)}</div><div class="detail-layout"><div><div class="detail-photo" id="detailPhoto">${pic}</div>${thumbs}</div><div><span class="detail-brand">${escapeHtml(selectedBrand.name)}</span>${p.sample?'<span class="tag-demo">시연용</span>':''}<h1 class="detail-name">${escapeHtml(p.name)}</h1><div class="detail-price">${currency(p.price)}${p.originalPrice>p.price?`<span class="compare-price">${currency(p.originalPrice)}</span>`:''}</div><div class="detail-desc">${escapeHtml(p.desc||'등록된 상품 설명이 없습니다.')}</div><div class="detail-metadata"><div><b>카테고리</b><span>${escapeHtml(p.category||'미분류')}</span></div><div><b>재고</b><span>${p.stock>0?currency(p.stock).replace('원','개'):'품절'}</span></div><div><b>배송안내</b><span>실제 배송비 및 일정은 정식 운영 시 설정합니다.</span></div></div><span class="micro">수량</span><div class="qty" aria-label="주문 수량"><button id="qtyDown" aria-label="수량 줄이기">−</button><span id="qtyValue">1</span><button id="qtyUp" aria-label="수량 늘리기">+</button></div><div class="detail-actions"><button id="addToCart" class="button" ${p.stock<=0?'disabled':''}>${p.stock<=0?'품절':'장바구니 담기 ↗'}</button><a href="${returnLink}" class="button-outline">브랜드 상품 목록</a></div>${p.sample?'<div class="demo-note">시연용 샘플 상품입니다. 표시된 상품명·가격·재고는 실제 판매정보가 아닙니다.</div>':''}</div></div></section>${related.length?`<div class="section-cream"><section class="section"><div class="section-top"><div><span class="section-kicker">YOU MAY ALSO LIKE</span><h2 class="section-title">같은 브랜드의 다른 상품</h2></div><a class="text-link" href="${returnLink}">VIEW MORE ↗</a></div>${productGrid(related)}</section></div>`:''}`;
 document.getElementById('qtyDown').onclick=()=>{orderQty=Math.max(1,orderQty-1);document.getElementById('qtyValue').textContent=orderQty};document.getElementById('qtyUp').onclick=()=>{orderQty=Math.min(Math.max(1,p.stock),orderQty+1);document.getElementById('qtyValue').textContent=orderQty};document.getElementById('addToCart').onclick=()=>addCart(p.id,orderQty);
 document.querySelectorAll('[data-thumb]').forEach(btn=>btn.onclick=()=>{currentImage=Number(btn.dataset.thumb);document.getElementById('detailMainImage').src=p.images[currentImage];document.querySelectorAll('[data-thumb]').forEach(x=>x.classList.toggle('active',x===btn))})}
function notFound(){app.innerHTML=`<section class="section"><div class="empty-state"><strong>페이지를 찾을 수 없습니다</strong><a href="#/" class="button-outline">홈으로 돌아가기</a></div></section>`}
function addCart(id,qty){let p=byId(id);if(!p?.visible||p.stock<1)return;const cart=getCart();const existing=cart.find(x=>x.id===id);if(existing){existing.quantity=Math.min(p.stock,existing.quantity+qty)}else cart.push({id,quantity:Math.min(p.stock,qty)});saveCart(cart);openCart()}
function openCart(){document.getElementById('cartOverlay').hidden=false;document.getElementById('cartDrawer').classList.add('open');document.getElementById('cartDrawer').setAttribute('aria-hidden','false');renderCart()}
function closeCart(){document.getElementById('cartOverlay').hidden=true;document.getElementById('cartDrawer').classList.remove('open');document.getElementById('cartDrawer').setAttribute('aria-hidden','true')}
function renderCart(){const cart=getCart();const items=cart.map(item=>({...item,product:byId(item.id)})).filter(item=>item.product?.visible);
 const total=items.reduce((s,item)=>s+item.product.price*item.quantity,0);
 document.getElementById('cartBody').innerHTML=items.length?`<div class="cart-contents">${items.map(({id,quantity,product:p})=>`<div class="cart-item">${p.images?.length?`<img src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)}">`:placeholderProduct(p)}<div class="cart-item-info"><strong>${escapeHtml(p.name)}</strong><p>${currency(p.price)}${p.sample?' · 시연용':''}</p><div class="count-control"><button data-cart-dec="${escapeHtml(id)}" aria-label="수량 줄이기">−</button>${quantity}<button data-cart-inc="${escapeHtml(id)}" aria-label="수량 늘리기">+</button><button data-cart-remove="${escapeHtml(id)}" style="margin-left:auto">삭제</button></div></div></div>`).join('')}</div><div class="cart-total"><div><span>상품 합계</span><span>${currency(total)}</span></div>${hosted&&paymentAvailable()
  ? '<a href="#/checkout" class="button" id="checkoutLink">결제하기</a>'
  : '<small>현재 결제수단이 활성화되어 있지 않습니다.</small>'}</div>`:`<div class="ghost-empty">장바구니가 비어 있습니다.<br>마음에 드는 상품을 담아보세요.<br><button id="browseCart" class="button-outline">상품 둘러보기 ↗</button></div>`;
 document.querySelectorAll('[data-cart-dec]').forEach(b=>b.onclick=()=>changeCart(b.dataset.cartDec,-1));document.querySelectorAll('[data-cart-inc]').forEach(b=>b.onclick=()=>changeCart(b.dataset.cartInc,+1));document.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>removeCart(b.dataset.cartRemove));let browse=document.getElementById('browseCart');if(browse)browse.onclick=()=>{closeCart();location.hash='#/all'}}
function changeCart(id,diff){const cart=getCart(),item=cart.find(x=>x.id===id),p=byId(id);if(!item||!p)return;item.quantity=Math.min(Math.max(0,p.stock),item.quantity+diff);saveCart(cart.filter(x=>x.quantity>0));renderCart()}
function removeCart(id){saveCart(getCart().filter(x=>x.id!==id));renderCart()}
const paymentLabels={payple:'국내 카드 · 페이플',paypal:'해외 결제 · PayPal'};
const paymentStates={
 created:'결제 대기',processing:'결제 처리 중',review:'결제 확인 중',paid:'결제 완료',
 failed:'결제 실패',cancelled:'결제 취소',expired:'결제 시간 만료'
};
const paymentAmount=(amount,code)=>code==='USD'
 ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',currencyDisplay:'code'}).format(amount/100)
 : currency(amount);
const publicBasket=()=>getCart().filter(item=>byId(item.id)?.visible).map(({id,quantity})=>({id,quantity}));
let paypleScript;
function loadPayple(url){
 if(typeof window.PaypleCpayAuthCheck==='function')return Promise.resolve();
 if(paypleScript)return paypleScript;
 paypleScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=url;
  script.onload=()=>{
   if(typeof window.PaypleCpayAuthCheck==='function')resolve();
   else reject(new Error('페이플 결제창을 불러오지 못했습니다.'));
  };
  script.onerror=()=>reject(new Error('페이플 결제창을 불러오지 못했습니다.'));
  document.head.append(script);
 }).catch(error=>{paypleScript=null;throw error});
 return paypleScript;
}
function checkoutPage(){
 if(!hosted||!paymentAvailable()){notFound();return}
 app.innerHTML=`<section class="section checkout-section">
  <a href="#/all" class="text-link">상품 목록</a>
  <h1>주문 결제</h1>
  <div id="checkoutContent" class="panel"><p role="status">주문 금액을 확인하고 있습니다…</p></div>
 </section>`;
 const content=document.getElementById('checkoutContent');
 loadCheckout(content);
}
async function loadCheckout(content){
 const items=publicBasket();
 try{
  const {quotes}=await shopApi('/api/checkout/quote',{method:'POST',body:{items}});
  if(!content.isConnected)return;
  const options=Object.entries(quotes);
  if(!options.length)throw new Error('이 주문에서 사용할 수 있는 결제수단이 없습니다.');
  content.innerHTML=`<form id="checkoutForm">
   <fieldset class="editor-fields checkout-options">
    <legend>결제수단</legend>
    ${options.map(([method,q],index)=>`<label class="checkout-option">
     <input type="radio" name="method" value="${method}" ${index===0?'checked':''}>
     <span><strong>${paymentLabels[method]}</strong><small>상품 ${currency(q.subtotal)} · 배송비 ${currency(q.shippingFee)}${q.sandbox?' · 테스트 환경':''}</small></span>
     <span class="checkout-option-price">${paymentAmount(q.amount,q.currency)}</span>
    </label>`).join('')}
   </fieldset>
   <fieldset id="koreanShipping" class="editor-fields checkout-address">
    <legend>국내 배송 정보</legend>
    <div class="form-grid">
     <div class="field"><label for="shipName">받는 분</label><input id="shipName" name="name" autocomplete="shipping name" maxlength="80" required></div>
     <div class="field"><label for="shipPhone">전화번호</label><input id="shipPhone" name="phone" type="tel" autocomplete="shipping tel" maxlength="24" required></div>
     <div class="field"><label for="shipPostal">우편번호</label><input id="shipPostal" name="postal" inputmode="numeric" autocomplete="shipping postal-code" pattern="[0-9]{5}" maxlength="5" required></div>
     <div class="field full"><label for="shipAddress">주소와 상세주소</label><input id="shipAddress" name="address" autocomplete="shipping street-address" maxlength="240" required></div>
    </div>
   </fieldset>
   <p id="paypalShipping" class="field-help">PayPal 화면에서 해외 배송지를 선택하세요. 표시된 달러 금액으로 결제됩니다.</p>
   <button class="button" type="submit" id="checkoutSubmit">결제하기</button>
   <p id="checkoutStatus" class="checkout-status" role="status"></p>
  </form>`;
  const form=content.querySelector('form');
  const submit=form.querySelector('#checkoutSubmit');
  const status=form.querySelector('#checkoutStatus');
  const shipping=form.querySelector('#koreanShipping');
  const update=()=>{
   const method=form.elements.method.value;
   shipping.hidden=shipping.disabled=method!=='payple';
   form.querySelector('#paypalShipping').hidden=method!=='paypal';
   submit.textContent=paymentAmount(quotes[method].amount,quotes[method].currency)+' 결제하기';
  };
  form.querySelectorAll('input[name="method"]').forEach(radio=>radio.addEventListener('change',update));
  update();
  form.onsubmit=async event=>{
   event.preventDefault();
   if(submit.disabled)return;
   const fields=new FormData(form);
   const method=fields.get('method');
   submit.disabled=true;
   status.textContent='결제창을 열고 있습니다…';
   try{
    const session=await shopApi('/api/checkout/start',{method:'POST',body:{
     method,items,amount:quotes[method].amount,
     shipping:method==='payple'?Object.fromEntries(fields):undefined
    }});
    if(!form.isConnected)return;
    if(method==='paypal'){location.assign(session.url);return}
    await loadPayple(session.script);
    if(form.isConnected)window.PaypleCpayAuthCheck(session.fields);
   }catch(error){
    status.textContent=error.message;
    submit.disabled=false;
   }
  };
 }catch(error){
  if(!content.isConnected)return;
  content.innerHTML=`<p role="status">${escapeHtml(error.message)}</p><button class="button-outline" type="button">장바구니 열기</button>`;
  content.querySelector('button').onclick=openCart;
 }
}
function removePurchasedItems(order){
 const key='modu_global_completed_orders';
 let completed=[];
 try{completed=JSON.parse(getValue(key)||'[]')}catch{}
 if(!Array.isArray(completed))completed=[];
 if(completed.includes(order.id))return;
 const bought=new Map(order.items.map(item=>[item.id,item.quantity]));
 saveCart(getCart().map(item=>({...item,quantity:item.quantity-(bought.get(item.id)||0)})).filter(item=>item.quantity>0));
 putValue(key,JSON.stringify([...completed.slice(-99),order.id]));
}
async function paymentResultPage(receipt){
 app.innerHTML=`<section class="section checkout-section">
  <h1>결제 결과</h1><div id="paymentResult" class="panel"><p role="status">결제 결과를 확인하고 있습니다…</p></div>
 </section>`;
 const panel=document.getElementById('paymentResult');
 try{
  const order=await shopApi('/api/checkout/result?receipt='+encodeURIComponent(receipt));
  if(!panel.isConnected)return;
  if(order.status==='paid')removePurchasedItems(order);
  const waiting=['created','processing','review'].includes(order.status);
  const waitingMessage=waiting?'결제 완료가 확인될 때까지 같은 주문을 다시 결제하지 마세요.':'';
  panel.innerHTML=`<h2>${paymentStates[order.status]}</h2>
   <p>${paymentLabels[order.method]} · ${paymentAmount(order.amount,order.currency)}${order.sandbox?' · 테스트 환경':''}</p>
   <p>주문번호 <strong>${escapeHtml(order.id)}</strong></p>
   ${order.reason||waitingMessage?`<p role="status">${escapeHtml(order.reason||waitingMessage)}</p>`:''}
   <div class="admin-actions">${waiting?'<button class="button" id="checkPaymentAgain" type="button">상태 다시 확인</button>':''}
   <a class="button-outline" href="#/all">쇼핑 계속하기</a></div>`;
  const again=panel.querySelector('#checkPaymentAgain');
  if(again)again.onclick=()=>paymentResultPage(receipt);
 }catch(error){
  if(panel.isConnected)panel.innerHTML=`<p role="status">${escapeHtml(error.message)}</p><a href="#/all" class="button-outline">상품 목록</a>`;
 }
}
async function enterHostedAdmin(view){
 app.innerHTML='<section class="section checkout-section"><p role="status">관리자 권한을 확인하고 있습니다…</p></section>';
 const loading=app.firstElementChild;
 try{
  const catalog=await shopApi('/api/admin/catalog');
  if(!loading.isConnected)return;
  remoteCatalog=catalog;
  view();
 }catch(error){
  if(!loading.isConnected)return;
  if(error.status!==401){loading.textContent=error.message;return}
  showAdminLogin(view);
 }
}
function showAdminLogin(view){
 app.innerHTML=`<section class="section checkout-section">
  <h1>관리자 로그인</h1>
  <form class="panel" id="adminLogin">
   <div class="field"><label for="adminPassword">관리자 비밀번호</label>
   <input id="adminPassword" type="password" autocomplete="current-password" required></div>
   <div class="admin-actions"><button class="button" type="submit">로그인</button></div>
   <p role="status"></p>
  </form>
 </section>`;
 const form=document.getElementById('adminLogin');
 const submit=form.querySelector('button');
 form.onsubmit=async event=>{
  event.preventDefault();
  if(submit.disabled)return;
  submit.disabled=true;
  try{
   await shopApi('/api/admin/session',{method:'POST',body:{password:form.querySelector('input').value}});
   if(form.isConnected)await enterHostedAdmin(view);
  }catch(error){
   form.querySelector('[role=status]').textContent=error.message;
   submit.disabled=false;
  }
 };
}
function bindAdminLogout(){
 const logout=document.getElementById('adminLogout');
 if(logout)logout.onclick=async()=>{
  try{
   await shopApi('/api/admin/session',{method:'DELETE'});
   await refreshShop();
   route();
  }catch(error){alert(error.message)}
 };
}
async function ordersPage(){
 app.innerHTML=`<section class="admin-layout"><div class="admin-header"><h1>결제 주문</h1>
 <div class="admin-actions"><a href="#/admin" class="button-outline">상품 관리자</a><button id="adminLogout" class="button-outline" type="button">로그아웃</button></div>
 </div><div class="panel" id="orderList"><p role="status">주문을 불러오고 있습니다…</p></div></section>`;
 bindAdminLogout();
 const list=document.getElementById('orderList');
 try{
  const {orders}=await shopApi('/api/admin/orders');
  if(!list.isConnected)return;
  list.innerHTML=orders.length?`<div class="table-scroll"><table class="inventory-table">
  <thead><tr><th>주문번호 / 시각</th><th>결제</th><th>상품</th><th>배송 정보</th></tr></thead>
  <tbody>${orders.map(order=>{
   const shipping=order.shipping;
   const state=paymentStates[order.status];
   const check=['processing','review'].includes(order.status)
    ? `<button type="button" data-reconcile="${escapeHtml(order.id)}">결제 상태 확인</button>`:'';
   return `<tr><td><strong>${escapeHtml(order.id)}</strong><br>${new Date(order.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</td>
    <td>${paymentLabels[order.method]} · ${paymentAmount(order.amount,order.currency)}${order.sandbox?' · 테스트':''}<br>
    ${state}${order.transaction?'<br>'+escapeHtml(order.transaction):''}<br>${check}</td>
    <td>${order.items.map(item=>escapeHtml(item.name)+' × '+item.quantity).join('<br>')}</td>
    <td>${shipping?[shipping.name,shipping.country,shipping.postal,shipping.address,shipping.phone,shipping.email]
     .filter(Boolean).map(escapeHtml).join('<br>'):'—'}</td></tr>`;
  }).join('')}</tbody></table></div>`:'<p>표시할 주문이 없습니다.</p>';
  list.querySelectorAll('[data-reconcile]').forEach(button=>{
   button.onclick=async()=>{
    button.disabled=true;
    try{
     await shopApi('/api/admin/orders/reconcile',{method:'POST',body:{id:button.dataset.reconcile}});
     if(list.isConnected)ordersPage();
    }catch(error){alert(error.message);button.disabled=false}
   };
  });
 }catch(error){if(list.isConnected)list.textContent=error.message}
}
function formMarkup(selectedBrand){
 return `<div class="panel">
  <h2 id="editorTitle">상품 등록</h2>
  <form id="adminForm">
   <input type="hidden" id="editId">
   <fieldset class="editor-fields">
    <div class="form-grid">
     <div class="field">
      <label for="formBrand">브랜드 *</label>
      <select id="formBrand" required>${BRANDS.map(b=>`<option value="${b.id}" ${b.id===selectedBrand?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}</select>
     </div>
     <div class="field"><label for="formCategory">카테고리</label><input id="formCategory" placeholder="예: 스킨케어"></div>
     <div class="field full"><label for="formName">상품명 *</label><input id="formName" placeholder="정식 판매 상품명" maxlength="120" required></div>
     <div class="field"><label for="formPrice">판매가 (원) *</label><input id="formPrice" type="number" min="0" step="1" required></div>
     <div class="field"><label for="formOriginal">정상가 / 비교가격 (원)</label><input id="formOriginal" type="number" min="0" step="1" value="0"></div>
     <div class="field"><label for="formStock">재고 *</label><input id="formStock" type="number" min="0" step="1" value="0" required></div>
     <div class="field"><label for="formVisible">상품 공개</label><select id="formVisible"><option value="true">공개</option><option value="false">비공개</option></select></div>
     <div class="field full">
      <label for="formImages">상품 사진 (최대 4장)</label>
      <input id="formImages" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="imageHelp" multiple>
      <span class="field-help" id="imageHelp">JPG·PNG·WEBP, 사진당 원본 8MB 이하. 사진 크기를 줄여 저장합니다.</span>
      <div id="existingPreview" class="file-preview"></div>
      <label id="clearImagesLabel" hidden><input type="checkbox" id="clearImages"> 기존 사진 삭제</label>
     </div>
     <div class="field full"><label for="formDesc">상품 상세 설명</label><textarea id="formDesc" placeholder="상품 구성, 특징, 사용 방법, 주의사항 등"></textarea></div>
     <div class="field full"><label><input id="formFeatured" type="checkbox"> 메인페이지 추천상품에 우선 노출</label></div>
     <div class="field full"><label><input id="formSample" type="checkbox"> 시연용 샘플 표시</label></div>
    </div>
    <div class="admin-actions">
     <button class="button" id="submitEditor" type="submit">상품 등록</button>
     <button class="button-outline" id="resetEditor" type="button">입력 초기화</button>
    </div>
   </fieldset>
   <div class="admin-status">
    <p id="formStatus" role="status" tabindex="-1"></p>
    <div class="admin-actions" id="savedProductLinks" hidden></div>
   </div>
  </form>
 </div>`;
}
function adminPage(selectedBrand=BRANDS[0].id){const products=getProducts(),visible=products.filter(p=>p.visible).length;
 app.innerHTML=`<section class="admin-layout"><div class="crumb"><a href="#/">홈</a> / 관리자 데모</div><div class="admin-header"><div><span class="section-kicker">MODU GLOBAL MANAGEMENT</span><h1>상품 관리자</h1><p>브랜드별 상품·가격·재고·사진을 등록하고 쇼핑몰 전시를 관리합니다.</p></div><div class="admin-actions">
 <a class="button-outline" href="#/">쇼핑몰 보기 ↗</a>
 ${hosted?'<a class="button-outline" href="#/admin/orders">결제 주문</a><button class="button-outline" type="button" id="adminLogout">로그아웃</button>':''}
 </div></div>
 ${hosted?'':'<div class="admin-warning">시연 모드에서는 상품이 이 브라우저에 저장됩니다.</div>'}<div class="admin-grid">${formMarkup(selectedBrand)}<aside class="panel"><h2>운영 도구</h2><div class="admin-summary">전체 상품 <strong id="adminTotalCount">${products.length}개</strong><br>공개 상품 <strong id="adminVisibleCount">${visible}개</strong><br>브랜드 <strong>${BRANDS.length}개</strong></div><hr style="border:0;border-top:1px solid #e2e7ed;margin:20px 0"><div class="admin-tools"><button id="exportBtn" class="button-outline">상품 데이터 백업 (JSON)</button><button id="importBtn" class="button-outline">상품 데이터 복원 (JSON)</button><input type="file" id="importFile" accept=".json,application/json" hidden>${hosted?'':'<button id="resetSamples" class="button-outline">시연용 샘플로 초기화</button>'}</div><p class="field-help" style="margin-top:16px">데이터를 잃지 않도록 백업 파일을 저장해 주세요. 초기화하면 현재 상품이 모두 교체됩니다.</p></aside></div><div class="panel inventory-panel"><div class="section-top"><div><span class="section-kicker">INVENTORY MANAGEMENT</span><h2 class="section-title" style="font-size:25px;margin:8px 0">등록 상품</h2></div><span class="micro">수정 · 비공개 · 삭제 가능</span></div><div class="filters"><select id="adminFilterBrand" class="select"><option value="all">전체 브랜드</option>${BRANDS.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}</select><input id="adminSearch" placeholder="상품명 검색" aria-label="관리자 상품명 검색"></div><div class="table-scroll"><table class="inventory-table"><thead><tr><th>이미지</th><th>브랜드 / 상품명</th><th>판매가</th><th>재고</th><th>상태</th><th>관리</th></tr></thead><tbody id="adminRows"></tbody></table></div></div></section>`;
 renderAdminRows();bindAdmin();bindAdminLogout()}
function renderAdminRows(){const tbody=document.getElementById('adminRows');if(!tbody)return;const bf=document.getElementById('adminFilterBrand')?.value||'all',term=(document.getElementById('adminSearch')?.value||'').toLowerCase();const products=getProducts().filter(p=>(bf==='all'||bf===p.brand)&&p.name.toLowerCase().includes(term)).sort((a,b)=>b.createdAt-a.createdAt);
 tbody.innerHTML=products.length?products.map(p=>`<tr><td>${p.images?.length?`<img class="table-thumbnail" src="${escapeHtml(p.images[0])}" alt="">`:'<span class="muted">사진 없음</span>'}</td><td><span class="micro">${escapeHtml(brand(p.brand)?.name||'')}</span><br>${p.visible&&brand(p.brand)?`<a class="inventory-product-link" href="${productLink(p.id)}">${escapeHtml(p.name)}</a>`:`<strong>${escapeHtml(p.name)}</strong>`}${p.sample?' <span class="tag-demo">샘플</span>':''}</td><td>${currency(p.price)}</td><td>${p.stock}</td><td>${p.visible?'공개':'<span class="muted">비공개</span>'}</td><td style="white-space:nowrap"><button data-edit="${escapeHtml(p.id)}">수정</button><button data-toggle="${escapeHtml(p.id)}">${p.visible?'숨김':'공개'}</button><button data-delete="${escapeHtml(p.id)}">삭제</button></td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:#8893a2;padding:30px">조건에 맞는 상품이 없습니다.</td></tr>';
 tbody.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));tbody.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
  const products=getProducts().map(product=>product.id===b.dataset.toggle?{...product,visible:!product.visible}:product);
  try{await saveProducts(products);if(b.isConnected)adminPage()}catch(error){alert(error.message)}
 });tbody.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete))}
function bindAdmin(){document.getElementById('adminForm').onsubmit=saveEditor;document.getElementById('resetEditor').onclick=resetEditor;document.getElementById('adminFilterBrand').onchange=renderAdminRows;document.getElementById('adminSearch').oninput=renderAdminRows;document.getElementById('formImages').onchange=previewImages;document.getElementById('exportBtn').onclick=exportProducts;document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();document.getElementById('importFile').onchange=importProducts;const reset=document.getElementById('resetSamples');
 if(reset)reset.onclick=async()=>{
  if(!confirm('현재 등록된 모든 상품을 시연용 샘플로 초기화할까요?'))return;
  try{await saveProducts(sampleProducts.map(cleanProduct));saveCart([]);adminPage()}catch(error){alert(error.message)}
 }}
function previewImages(){
 const el=id=>document.getElementById(id);
 const files=[...el('formImages').files];
 const existing=byId(el('editId').value)?.images||[];
 el('clearImagesLabel').hidden=files.length>0||!existing.length;
 el('existingPreview').innerHTML=files.length
  ? files.map(file=>`<span class="micro">${escapeHtml(file.name)}</span>`).join('<br>')
  : existing.map(image=>`<img alt="현재 등록된 이미지" src="${escapeHtml(image)}">`).join('');
}
function clearEditorStatus(){
 const status=document.getElementById('formStatus');
 status.textContent='';
 status.classList.remove('form-error');
 const links=document.getElementById('savedProductLinks');
 links.replaceChildren();
 links.hidden=true;
}
function resetEditor(){
 const form=document.getElementById('adminForm');
 form.reset();
 document.getElementById('editId').value='';
 document.getElementById('editorTitle').textContent='상품 등록';
 document.getElementById('submitEditor').textContent='상품 등록';
 previewImages();
 clearEditorStatus();
}
function editProduct(id){
 const el=key=>document.getElementById(key);
 if(el('adminForm').querySelector('fieldset').disabled)return;
 const p=byId(id);
 if(!p)return;
 resetEditor();
 const values={
  editId:p.id,formBrand:p.brand,formCategory:p.category||'',formName:p.name,
  formPrice:p.price,formOriginal:p.originalPrice||0,formStock:p.stock,
  formVisible:String(p.visible),formDesc:p.desc||''
 };
 Object.entries(values).forEach(([key,value])=>{el(key).value=value});
 el('formSample').checked=p.sample;
 el('formFeatured').checked=p.featured;
 el('editorTitle').textContent='상품 수정';
 el('submitEditor').textContent='변경 사항 저장';
 previewImages();
 el('formName').focus({preventScroll:true});
 el('editorTitle').scrollIntoView({behavior:'smooth',block:'start'});
}
async function deleteProduct(id){
 const product=byId(id);
 if(!product||!confirm(`“${product.name}” 상품을 삭제할까요?`))return;
 try{
  await saveProducts(getProducts().filter(item=>item.id!==id));
  saveCart(getCart().filter(item=>item.id!==id));
  adminPage();
 }catch(error){alert(error.message)}
}
function imgData(file){return new Promise((res,rej)=>{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)return rej(new Error('사진은 JPG·PNG·WEBP, 원본 8MB 이하만 가능합니다.'));let reader=new FileReader();reader.onerror=()=>rej(new Error('사진 파일을 읽지 못했습니다.'));reader.onload=()=>{let image=new Image();image.onerror=()=>rej(new Error('이미지 형식이 올바르지 않습니다.'));image.onload=()=>{const max=920;let scale=Math.min(1,max/Math.max(image.width,image.height));let c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));let ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.76))};image.src=reader.result};reader.readAsDataURL(file)})}
async function saveEditor(event){
 event.preventDefault();
 const form=event.currentTarget;
 const fields=form.querySelector('fieldset');
 if(fields.disabled)return;
 const el=id=>form.querySelector('#'+id);
 const editId=el('editId').value;
 const files=[...el('formImages').files];
 const clearImages=el('clearImages').checked;
 const status=el('formStatus');
 clearEditorStatus();
 fields.disabled=true;
 status.textContent='상품을 저장하고 있습니다…';
 try{
  const product={
   id:editId||'product-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
   brand:el('formBrand').value,
   category:el('formCategory').value.trim(),
   name:el('formName').value.trim(),
   price:Number(el('formPrice').value),
   originalPrice:Number(el('formOriginal').value||0),
   stock:Number(el('formStock').value),
   desc:el('formDesc').value.trim(),
   visible:el('formVisible').value==='true',
   featured:el('formFeatured').checked,
   sample:el('formSample').checked
  };
  if(!product.name||!el('formPrice').value||!el('formStock').value||
    ![product.price,product.originalPrice,product.stock].every(value=>Number.isSafeInteger(value)&&value>=0)){
   throw Error('상품명, 가격, 재고를 올바르게 입력해 주세요.');
  }
  if(!brand(product.brand))throw Error('브랜드를 선택해 주세요.');
  if(files.length>4)throw Error('상품 사진은 최대 4장입니다.');
  const uploadedImages=files.length?await Promise.all(files.map(imgData)):null;
  if(!form.isConnected)return;

  const products=getProducts().slice();
  const oldIndex=editId?products.findIndex(item=>item.id===editId):-1;
  if(editId&&oldIndex<0)throw Error('수정할 상품이 삭제되었습니다. 입력을 초기화하고 다시 등록해 주세요.');
  const old=products[oldIndex];
  product.images=uploadedImages||(clearImages?[]:old?.images||[]);
  product.createdAt=old?.createdAt||Date.now();
  if(old)products[oldIndex]={...old,...product};
  else products.push(product);
  const persisted=await saveProducts(products);
  if(!form.isConnected)return;

  resetEditor();
  el('formBrand').value=product.brand;
  document.getElementById('adminTotalCount').textContent=products.length+'개';
  document.getElementById('adminVisibleCount').textContent=products.filter(item=>item.visible).length+'개';
  renderAdminRows();
  showSaveResult(product,Boolean(old),persisted);
 }catch(error){
  status.classList.add('form-error');
  const message=error.name==='QuotaExceededError'
   ? '브라우저 저장 공간이 부족합니다. 사진의 수나 크기를 줄여 다시 시도해 주세요.'
   : error.message;
  status.textContent='저장 실패 · '+message;
  status.focus();
 }finally{
  fields.disabled=false;
 }
}
function showSaveResult(product,isEdit,persisted){
 const status=document.getElementById('formStatus');
 const action=isEdit?'수정':'등록';
 const visibility=product.visible?'공개':'비공개';
 const storageNote=persisted?'':' 브라우저 저장소를 사용할 수 없어 이 페이지를 닫거나 새로고침하면 사라집니다.';
 status.textContent=`“${product.name}” 상품을 ${visibility}로 ${action}했습니다.${storageNote}`;
 const links=document.getElementById('savedProductLinks');
 links.innerHTML=product.visible
  ? `<a class="button-outline" href="${productLink(product.id)}">상품 상세 보기 ↗</a>
     <a class="button-outline" href="${brandLink(product.brand)}">브랜드 상품 목록 ↗</a>`
  : '';
 links.hidden=!product.visible;
 status.focus();
}
function exportProducts(){const blob=new Blob([JSON.stringify({type:'MODU_GLOBAL_PRODUCTS',version:4,exportedAt:new Date().toISOString(),products:getProducts()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download='modu-global-products-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function importProducts(e){const file=e.target.files?.[0];if(!file)return;try{if(file.size>15*1024*1024)throw Error('백업 파일이 너무 큽니다.');const data=JSON.parse(await file.text());if(data.type!=='MODU_GLOBAL_PRODUCTS'||!Array.isArray(data.products))throw Error('모두글로벌 백업 파일만 복원할 수 있습니다.');if(!confirm(`현재 상품을 백업 파일의 ${data.products.length}개 상품으로 교체할까요?`))return;const list=data.products.map(cleanProduct);if(new Set(list.map(p=>p.id)).size!==list.length||list.some(p=>!p.id.trim()||!p.name.trim()||!brand(p.brand)||p.price<0||p.stock<0||p.images?.some(x=>typeof x!=='string'||!x.startsWith('data:image/'))))throw Error('백업 파일에 유효하지 않은 상품 데이터가 있습니다.');await saveProducts(list);saveCart([]);adminPage()}catch(err){alert('복원 실패: '+err.message)}finally{e.target.value=''}}
function route(){
 closeCart();
 document.title=siteTitle;
 let path='/';
 try{path=decodeURIComponent(location.hash.slice(1)||'/')}catch{path=null}
 if(path==='/')home();
 else if(path==='/brands')brandsPage();
 else if(path==='/all')listingPage('all');
 else if(path==='/checkout')checkoutPage();
 else if(path?.startsWith('/payment/')&&hosted)paymentResultPage(path.slice('/payment/'.length));
 else if(path==='/admin/orders'&&hosted)enterHostedAdmin(ordersPage);
 else if(path==='/admin'){if(hosted)enterHostedAdmin(()=>adminPage());else adminPage();}
 else if(path?.startsWith('/admin/brand/')){
  const target=brand(path.slice('/admin/brand/'.length));
  if(!target)notFound();
  else if(hosted)enterHostedAdmin(()=>adminPage(target.id));
  else adminPage(target.id);
 }else if(path?.startsWith('/brand/')){
  const id=path.slice('/brand/'.length);
  listingPage(id==='meicell'?'whang':id);
 }else if(path?.startsWith('/product/'))detailPage(path.slice('/product/'.length));
 else if(path?.startsWith('/search/'))listingPage('all',path.slice('/search/'.length));
 else notFound();
 window.scrollTo({top:0,behavior:'instant'});
}
document.getElementById('searchForm').onsubmit=e=>{e.preventDefault();let q=document.getElementById('searchInput').value.trim();if(q)location.hash='#/search/'+encodeURIComponent(q)};
document.getElementById('cartTrigger').onclick=openCart;document.getElementById('cartClose').onclick=closeCart;document.getElementById('cartOverlay').onclick=closeCart;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});window.addEventListener('hashchange',route);
async function start(){
 if(hosted){
  document.querySelector('.preview-tag').hidden=true;
  document.getElementById('footerAdmin').textContent='상품 관리자';
  document.getElementById('footerCheckout').hidden=true;
  try{await refreshShop()}catch{
   app.innerHTML='<section class="section"><p role="status">쇼핑몰 서버에 연결할 수 없습니다. 새로고침해 주세요.</p></section>';
   return;
  }
 }else getProducts();
 updateCartCount();
 route();
}
start();
})();
