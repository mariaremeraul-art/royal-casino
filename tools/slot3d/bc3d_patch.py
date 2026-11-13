# Baccarat 3D: lienzo dentro del tapete + avisos a la capa 3D. Las cartas, la tercera carta y los pagos los sigue decidiendo bcPlay.
p='/workspace/royal-casino/index.html'; s=open(p).read()
def rep(a,b):
    global s
    if b in s: return
    assert s.count(a)==1, a[:70]; s=s.replace(a,b,1)
rep('''  <div class="felt pc-felt">
    <div class="zone">
      <div class="zone-lab">Banca <b class="bc-tot" id="bc-bt"></b></div>''','''  <div class="felt pc-felt">
    <div id="bc3d" aria-hidden="true"></div>
    <div class="zone bc-zone-b">
      <div class="zone-lab">Banca <b class="bc-tot" id="bc-bt"></b></div>''')
rep('''    <div class="zone">
      <div class="zone-lab">Jugador <b class="bc-tot" id="bc-pt"></b></div>''','''    <div class="zone bc-zone-p">
      <div class="zone-lab">Jugador <b class="bc-tot" id="bc-pt"></b></div>''')
rep("  const still=fxRM(), third=P.length>2||B.length>2;\n  setTimeout(()=>{ pcRender('bc-player',P);",
    "  const still=fxRM(), third=P.length>2||B.length>2;\n  let b3=null; try{ if(window.BC3D&&BC3D.on()) b3=BC3D.play({P:P.map(c=>c[0]+c[1]),B:B.map(c=>c[0]+c[1]),side,bet,still}); }catch(e){ b3=null; } // el 3D solo anima\n  setTimeout(()=>{ pcRender('bc-player',P);")
rep("$('bc-pt').textContent=pT; $('bc-bt').textContent=bT; }, still?0:430);","$('bc-pt').textContent=pT; $('bc-bt').textContent=bT; }, b3?b3.third:(still?0:430));")
rep("    recordPlay('Baccarat',bet,win-bet,msg); bcBusy=false; repRefreshAll();","    try{ if(b3&&window.BC3D) BC3D.result({side,cls,bet,win}); }catch(e){}\n    recordPlay('Baccarat',bet,win-bet,msg); bcBusy=false; repRefreshAll();")
rep("  }, still?0:(third?680:500));\n}\nlet crUlt=0","  }, b3?b3.end:(still?0:(third?680:500)));\n}\nlet crUlt=0")
if 'id="bc3d-css"' not in s: s=s.replace('</head>',open('/workspace/slot3d/src/bc3d.css').read()+'</head>',1)
else:
    i=s.index('<style id="bc3d-css">'); j=s.index('</style>',i)+len('</style>\n'); s=s[:i]+open('/workspace/slot3d/src/bc3d.css').read()+s[j:]
i=s.index('/* Blackjack 3D +'); j=s.index('\n',i)+1; k=s.index('\n</script>',j)
s=s[:i]+'/* Blackjack 3D + Póker de 2 cartas 3D + Baccarat 3D + Tragaperras 3D + Slots 5 3D · three.js r187 (MIT) recortado con esbuild; capas visuales, no tocan la lógica de premios */\n'+open('/workspace/slot3d/dist/casino3d.min.js').read().strip()+s[k:]
open(p,'w').write(s); print('bc3d_patch ok')
