(function(){
  var LOW=10;
  var items=[
    {n:'Cotton shirt, blue',s:'SH-101',q:48,p:899},{n:'Denim jacket',s:'JK-220',q:6,p:2499},{n:'Canvas sneakers',s:'SN-310',q:0,p:1799},
    {n:'Leather belt',s:'BT-415',q:27,p:699},{n:'Wool scarf',s:'SC-502',q:9,p:549},{n:'Travel backpack',s:'BP-608',q:14,p:2199},
    {n:'Sports socks (3 pack)',s:'SK-710',q:120,p:299},{n:'Rain jacket',s:'JK-233',q:3,p:1999}
  ];
  var $=function(i){return document.getElementById(i)};
  var money=function(n){return '₹'+n.toLocaleString('en-IN')};
  var status=function(i){return i.q===0?'out':i.q<=LOW?'low':'ok'};
  var label={ok:'In stock',low:'Low stock',out:'Out of stock'};
  function render(){
    var q=$('q').value.trim().toLowerCase(),st=$('st').value;
    var rows=items.filter(function(i){return(!q||i.n.toLowerCase().indexOf(q)>-1||i.s.toLowerCase().indexOf(q)>-1)&&(!st||status(i)===st)});
    var tb=$('rows');tb.textContent='';
    rows.forEach(function(i){
      var tr=document.createElement('tr'),cells=[i.n,i.s,String(i.q),money(i.p)];
      cells.forEach(function(c,k){var td=document.createElement('td');td.textContent=c;if(k>1)td.className='n';tr.appendChild(td)});
      var td=document.createElement('td'),sp=document.createElement('span');sp.className='tag '+status(i);sp.textContent=label[status(i)];td.appendChild(sp);tr.appendChild(td);tb.appendChild(tr);
    });
    $('empty').hidden=rows.length>0;
    var low=items.filter(function(i){return status(i)==='low'}).length,out=items.filter(function(i){return status(i)==='out'}).length;
    $('s-items').textContent=items.length;$('s-low').textContent=low;$('s-out').textContent=out;
    $('s-val').textContent=money(items.reduce(function(a,i){return a+i.q*i.p},0));
    var a=$('alert');a.className='alert'+(low+out?' show':'');a.textContent=low+out?(low+' item(s) are running low and '+out+' are out of stock. Reorder soon.'):'';
  }
  $('q').addEventListener('input',render);$('st').addEventListener('change',render);
  $('add').addEventListener('submit',function(e){
    e.preventDefault();var n=$('a-name'),s=$('a-sku'),q=$('a-qty'),p=$('a-price'),m=$('a-msg');
    var okN=n.value.trim().length>1,okS=s.value.trim().length>1;
    n.setAttribute('aria-invalid',okN?'false':'true');s.setAttribute('aria-invalid',okS?'false':'true');
    if(!okN||!okS){m.className='msg bad';m.textContent='Please enter an item name and SKU.';return}
    if(items.some(function(i){return i.s.toLowerCase()===s.value.trim().toLowerCase()})){m.className='msg bad';m.textContent='That SKU already exists.';return}
    items.unshift({n:n.value.trim(),s:s.value.trim().toUpperCase(),q:Math.max(0,parseInt(q.value,10)||0),p:Math.max(0,parseInt(p.value,10)||0)});
    m.className='msg ok';m.textContent='Added. (Demo only: this is not saved.)';n.value='';s.value='';render();
  });
  render();
})();
