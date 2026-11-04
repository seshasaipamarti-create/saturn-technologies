(function(){
  var P=[
    {id:1,n:'Canvas tote bag',d:'Sturdy everyday carry-all.',p:799,c:'bags',t:'t1',i:'bag'},
    {id:2,n:'Weekender duffel',d:'Roomy bag for short trips.',p:2499,c:'bags',t:'t3',i:'bag'},
    {id:3,n:'Stoneware mug',d:'Hand-glazed, 300 ml.',p:449,c:'home',t:'t2',i:'mug'},
    {id:4,n:'Linen cushion cover',d:'Soft, washed linen.',p:649,c:'home',t:'t4',i:'home'},
    {id:5,n:'Dotted notebook',d:'A5, 120 gsm paper.',p:299,c:'stationery',t:'t1',i:'book'},
    {id:6,n:'Brass pen',d:'Refillable and balanced.',p:1199,c:'stationery',t:'t2',i:'book'},
    {id:7,n:'Ceramic planter',d:'For small desk plants.',p:549,c:'home',t:'t3',i:'home'},
    {id:8,n:'Leather card holder',d:'Slim, holds six cards.',p:999,c:'bags',t:'t4',i:'bag'}
  ];
  var ICON={bag:'<path d="M6 7h12l1 13H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',mug:'<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 5h-2"/>',home:'<path d="m4 11 8-6 8 6v8H4z"/><path d="M10 19v-5h4v5"/>',book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'};
  var $=function(i){return document.getElementById(i)},money=function(n){return '₹'+n.toLocaleString('en-IN')};
  var cart={},cat='all';
  function grid(){
    var g=$('grid');g.textContent='';
    P.filter(function(x){return cat==='all'||x.c===cat}).forEach(function(x){
      var li=document.createElement('li');li.className='card';
      li.innerHTML='<div class="tile '+x.t+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[x.i]+'</svg></div><div class="info"><h3></h3><p></p><span class="price"></span><button type="button" class="add"></button></div>';
      li.querySelector('h3').textContent=x.n;li.querySelector('p').textContent=x.d;li.querySelector('.price').textContent=money(x.p);
      var b=li.querySelector('.add');b.textContent='Add to cart';b.setAttribute('aria-label','Add '+x.n+' to cart');b.addEventListener('click',function(){cart[x.id]=(cart[x.id]||0)+1;draw();});
      g.appendChild(li);
    });
  }
  function draw(){
    var ul=$('lines');ul.textContent='';var total=0,count=0;
    P.forEach(function(x){var q=cart[x.id];if(!q)return;total+=q*x.p;count+=q;
      var li=document.createElement('li');li.innerHTML='<span></span><b></b><div class="q"><button type="button" aria-label="Decrease quantity">−</button><span></span><button type="button" aria-label="Increase quantity">+</button></div><button type="button" class="x" aria-label="Remove">×</button>';
      li.children[0].textContent=x.n;li.children[1].textContent=money(q*x.p);li.querySelector('.q span').textContent=q;
      var bs=li.querySelectorAll('.q button');bs[0].addEventListener('click',function(){cart[x.id]--;if(!cart[x.id])delete cart[x.id];draw()});bs[1].addEventListener('click',function(){cart[x.id]++;draw()});
      li.querySelector('.x').addEventListener('click',function(){delete cart[x.id];draw()});ul.appendChild(li);});
    $('count').textContent=count;$('total').textContent=money(total);$('cart-empty').hidden=count>0;
  }
  document.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){cat=c.dataset.cat;document.querySelectorAll('.chip').forEach(function(o){o.classList.toggle('on',o===c)});grid()})});
  var open=function(v){$('cart').hidden=!v;$('open-cart').setAttribute('aria-expanded',String(v))};
  $('open-cart').addEventListener('click',function(){open($('cart').hidden)});$('close-cart').addEventListener('click',function(){open(false);$('open-cart').focus()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')open(false)});
  grid();draw();
})();
