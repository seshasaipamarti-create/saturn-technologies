(function(){
  var f=document.getElementById('book-form'),s=document.getElementById('b-status'),d=document.getElementById('b-date');
  var t=new Date();t.setDate(t.getDate()+1);d.min=new Date().toISOString().slice(0,10);d.value=t.toISOString().slice(0,10);
  f.addEventListener('submit',function(e){
    e.preventDefault();var bad=[];
    ['name','phone','date'].forEach(function(n){var el=f.elements[n];var v=el.value.trim();var ok=n==='phone'?/^[+\d][\d\s-]{7,}$/.test(v):v.length>1;el.setAttribute('aria-invalid',ok?'false':'true');if(!ok)bad.push(n)});
    if(bad.length){s.className='status bad';s.textContent='Please check: '+bad.join(', ')+'.';f.elements[bad[0]].focus();return}
    s.className='status ok';s.textContent='Demo only: a table for '+f.elements.guests.value+' on '+f.elements.date.value+' at '+f.elements.time.value+' would be requested now. Nothing was saved or sent.';
  });
})();
